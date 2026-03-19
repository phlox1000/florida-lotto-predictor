import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import {
  insertPdfUpload,
  updatePdfUploadStatus,
  insertDrawResult,
  insertPurchasedTicket,
  getUserPredictionsByGame,
  getDrawResultByGameDateTime,
  evaluatePurchasedTicketsAgainstDraw,
} from "./db";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { createContext } from "./_core/context";

function guessImageMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return "image/jpeg";
  return "image/jpeg";
}

function stripDataUrlPrefix(maybeDataUrl: string): string {
  const idx = maybeDataUrl.indexOf("base64,");
  if (idx >= 0) return maybeDataUrl.slice(idx + "base64,".length);
  return maybeDataUrl;
}

/**
 * Register all upload routes on the Express app.
 */
export function registerUploadRoutes(app: Express) {
  // ─── PDF Upload (Admin) ──────────────────────────────────────────────────
  app.post("/api/upload-pdf", async (req: Request, res: Response) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (ctx.user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const { fileName, fileData, gameType } = req.body as {
        fileName: string;
        fileData: string;
        gameType?: string;
      };

      if (!fileName || !fileData) {
        res.status(400).json({ error: "fileName and fileData (base64) are required" });
        return;
      }

      const pdfBuffer = Buffer.from(fileData, "base64");
      if (pdfBuffer.length > 16 * 1024 * 1024) {
        res.status(400).json({ error: "File too large. Maximum 16MB." });
        return;
      }

      const fileKey = `pdf-uploads/${ctx.user.id}-${nanoid(8)}-${fileName}`;
      const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      const uploadId = await insertPdfUpload({
        userId: ctx.user.id,
        fileName,
        fileUrl,
        fileKey,
        gameType: gameType || null,
        status: "processing",
      });

      processPdfWithLLM(uploadId, fileUrl, fileData, gameType || null)
        .catch(err => console.error("[PDF Upload] Background processing failed:", err));

      res.json({
        success: true,
        uploadId,
        fileUrl,
        status: "processing",
        message: "PDF uploaded and queued for processing. Numbers will be extracted shortly.",
      });
    } catch (err) {
      console.error("[PDF Upload] Error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ─── Ticket Scan (Image → LLM Vision) ──────────────────────────────────
  app.post("/api/upload-ticket", async (req: Request, res: Response) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { fileName, fileData, cost } = req.body as {
        fileName: string;
        fileData: string; // base64 (may include data-url prefix)
        cost: number | string;
      };

      if (!fileName || !fileData) {
        res.status(400).json({ error: "fileName and fileData (base64) are required" });
        return;
      }

      const numericCost = Number(cost);
      if (!Number.isFinite(numericCost) || numericCost < 0) {
        res.status(400).json({ error: "cost must be a non-negative number" });
        return;
      }

      const base64 = stripDataUrlPrefix(String(fileData));
      const imgBuffer = Buffer.from(base64, "base64");
      if (imgBuffer.length > 10 * 1024 * 1024) {
        res.status(400).json({ error: "Image too large. Maximum 10MB." });
        return;
      }

      // Upload image to S3 so the LLM can access it via URL
      const mimeType = guessImageMimeType(fileName);
      const fileKey = `ticket-scans/${ctx.user.id}-${nanoid(8)}-${fileName}`;
      const { url: fileUrl } = await storagePut(fileKey, imgBuffer, mimeType);

      // Use LLM vision to extract ticket data
      const extracted = await processTicketImageWithLLM(fileUrl, mimeType);

      const gameType = extracted.gameType as GameType;
      const cfg = FLORIDA_GAMES[gameType];
      if (!cfg) {
        res.status(400).json({ error: "Could not determine game type from ticket" });
        return;
      }

      const drawDateTs = new Date(extracted.drawDate).getTime();
      if (!Number.isFinite(drawDateTs)) {
        res.status(400).json({ error: "Invalid drawDate extracted from ticket" });
        return;
      }

      const drawTime = extracted.drawTime.toLowerCase() as "midday" | "evening";
      if (drawTime !== "midday" && drawTime !== "evening") {
        res.status(400).json({ error: "Invalid drawTime extracted from ticket" });
        return;
      }

      const ticketMain = extracted.mainNumbers.slice().sort((a, b) => a - b);
      const ticketSpecial = (extracted.specialNumbers || []).slice().sort((a, b) => a - b);

      // Validate counts and ranges
      if (ticketMain.length !== cfg.mainCount) {
        res.status(400).json({ error: `Unexpected main number count (got ${ticketMain.length}, expected ${cfg.mainCount})` });
        return;
      }

      if (cfg.isDigitGame) {
        if (ticketMain.some(n => n < 0 || n > 9)) {
          res.status(400).json({ error: "Digit game main numbers must be in range 0-9" });
          return;
        }
      } else {
        if (ticketMain.some(n => n < 1 || n > cfg.mainMax)) {
          res.status(400).json({ error: "Main numbers out of range" });
          return;
        }
      }

      let normalizedSpecial: number[] = [];
      if (cfg.specialCount > 0) {
        if (ticketSpecial.length !== cfg.specialCount) {
          res.status(400).json({ error: `Unexpected special number count (got ${ticketSpecial.length}, expected ${cfg.specialCount})` });
          return;
        }
        normalizedSpecial = ticketSpecial;
        if (normalizedSpecial.some(n => n < 1 || n > cfg.specialMax)) {
          res.status(400).json({ error: "Special numbers out of range" });
          return;
        }
      }

      // Match against saved predictions to infer modelSource
      const predictions = await getUserPredictionsByGame(ctx.user.id, gameType, 250);
      let bestMatch: { modelName: string; score: number; exact: boolean; mainHits: number; specialHits: number } | null = null;

      for (const p of predictions) {
        const predMain = (p.mainNumbers as number[]) || [];
        const predSpecial = (p.specialNumbers as number[]) || [];
        const predMainSet = new Set(predMain);
        const predSpecialSet = new Set(predSpecial);
        const mainHits = ticketMain.filter(n => predMainSet.has(n)).length;
        const specialHits = normalizedSpecial.filter(n => predSpecialSet.has(n)).length;
        const exact = mainHits === cfg.mainCount && (cfg.specialCount === 0 || specialHits === cfg.specialCount);
        const score = (mainHits * 100) + (specialHits * 10) + (Number(p.confidenceScore) || 0);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { modelName: p.modelName, score, exact, mainHits, specialHits };
        }
      }

      const matchModelSource = bestMatch?.modelName;
      const ticketNotes = `Draw period: ${drawTime}\nScanned: ${new Date().toISOString()}\nMatched model: ${matchModelSource ?? "unknown"}`;

      const ticketId = await insertPurchasedTicket({
        userId: ctx.user.id,
        gameType,
        mainNumbers: ticketMain,
        specialNumbers: normalizedSpecial.length > 0 ? normalizedSpecial : [],
        purchaseDate: Date.now(),
        drawDate: drawDateTs,
        cost: numericCost,
        notes: ticketNotes,
        modelSource: matchModelSource ?? undefined,
      });

      // If results already exist for this draw, evaluate immediately
      const existingDraw = await getDrawResultByGameDateTime(gameType, drawDateTs, drawTime);
      let evaluatedNow = false;
      if (existingDraw) {
        await evaluatePurchasedTicketsAgainstDraw(
          gameType,
          drawDateTs,
          drawTime,
          (existingDraw.mainNumbers as number[]) || [],
          (existingDraw.specialNumbers as number[]) || []
        );
        evaluatedNow = true;
      }

      res.json({
        success: true,
        ticketId,
        extracted: {
          gameType,
          gameName: cfg.name,
          drawDate: extracted.drawDate,
          drawTime,
          mainNumbers: ticketMain,
          specialNumbers: normalizedSpecial,
        },
        matchedModel: matchModelSource ?? null,
        evaluatedNow,
        imageUrl: fileUrl,
      });
    } catch (err: any) {
      console.error("[Ticket Scan] Error:", err);
      res.status(500).json({ error: err?.message || "Ticket scan failed" });
    }
  });

  // ─── Manual Ticket Entry ────────────────────────────────────────────────
  app.post("/api/manual-ticket", async (req: Request, res: Response) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { gameType, mainNumbers, specialNumbers, drawDate, drawTime, cost, notes, modelSource } = req.body as {
        gameType: string;
        mainNumbers: number[];
        specialNumbers?: number[];
        drawDate: string; // YYYY-MM-DD
        drawTime?: string;
        cost: number;
        notes?: string;
        modelSource?: string;
      };

      const cfg = FLORIDA_GAMES[gameType as GameType];
      if (!cfg) {
        res.status(400).json({ error: "Invalid game type" });
        return;
      }

      const drawDateTs = new Date(drawDate).getTime();
      if (!Number.isFinite(drawDateTs)) {
        res.status(400).json({ error: "Invalid draw date" });
        return;
      }

      const normalizedDrawTime = (drawTime || "evening").toLowerCase() as "midday" | "evening";
      const ticketNotes = `Draw period: ${normalizedDrawTime}\nManual entry: ${new Date().toISOString()}${notes ? `\n${notes}` : ""}`;

      const ticketId = await insertPurchasedTicket({
        userId: ctx.user.id,
        gameType: gameType as GameType,
        mainNumbers,
        specialNumbers: specialNumbers || [],
        purchaseDate: Date.now(),
        drawDate: drawDateTs,
        cost: Number(cost) || 0,
        notes: ticketNotes,
        modelSource: modelSource ?? undefined,
      });

      // If results already exist for this draw, evaluate immediately
      const existingDraw = await getDrawResultByGameDateTime(gameType, drawDateTs, normalizedDrawTime);
      let evaluatedNow = false;
      if (existingDraw) {
        await evaluatePurchasedTicketsAgainstDraw(
          gameType as GameType,
          drawDateTs,
          normalizedDrawTime,
          (existingDraw.mainNumbers as number[]) || [],
          (existingDraw.specialNumbers as number[]) || []
        );
        evaluatedNow = true;
      }

      res.json({
        success: true,
        ticketId,
        evaluatedNow,
      });
    } catch (err: any) {
      console.error("[Manual Ticket] Error:", err);
      res.status(500).json({ error: err?.message || "Manual ticket entry failed" });
    }
  });
}

// ─── Background PDF Processing ──────────────────────────────────────────────

async function processPdfWithLLM(
  uploadId: number,
  fileUrl: string,
  fileDataBase64: string,
  gameType: string | null
) {
  try {
    const gameHint = gameType && FLORIDA_GAMES[gameType as GameType]
      ? `This PDF contains ${FLORIDA_GAMES[gameType as GameType].name} results. The game has ${FLORIDA_GAMES[gameType as GameType].mainCount} main numbers${FLORIDA_GAMES[gameType as GameType].specialCount > 0 ? ` and ${FLORIDA_GAMES[gameType as GameType].specialCount} special number(s)` : ""}.`
      : "This PDF contains Florida Lottery winning number results. Identify which game each set of numbers belongs to.";

    const gameTypeList = GAME_TYPES.map(gt => {
      const cfg = FLORIDA_GAMES[gt];
      return `${gt}: ${cfg.name} (${cfg.mainCount} main numbers${cfg.isDigitGame ? " digits 0-9" : ` 1-${cfg.mainMax}`}${cfg.specialCount > 0 ? `, ${cfg.specialCount} special 1-${cfg.specialMax}` : ""})`;
    }).join("\n");

    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a precise data extraction assistant. Extract ALL lottery drawing results from the provided PDF document. Return ONLY valid JSON. Today is ${new Date().toISOString().split("T")[0]}.

Available game types:\n${gameTypeList}`
        },
        {
          role: "user",
          content: [
            {
              type: "file_url" as const,
              file_url: {
                url: fileUrl,
                mime_type: "application/pdf" as const,
              },
            },
            {
              type: "text" as const,
              text: `${gameHint}

Extract ALL lottery drawing results from this PDF. For each draw found, determine:
1. The game type (use one of: ${GAME_TYPES.join(", ")})
2. The draw date (YYYY-MM-DD format)
3. The main numbers
4. Any special/bonus numbers (empty array if none)
5. Draw time if applicable (midday/evening, or "evening" if not specified)

Return JSON: { "draws": [{ "gameType": "string", "drawDate": "YYYY-MM-DD", "mainNumbers": [numbers], "specialNumbers": [numbers or empty], "drawTime": "evening" }] }

Extract as many draws as you can find. Be precise with the numbers.`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pdf_lottery_draws",
          strict: true,
          schema: {
            type: "object",
            properties: {
              draws: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    gameType: { type: "string" },
                    drawDate: { type: "string" },
                    mainNumbers: { type: "array", items: { type: "number" } },
                    specialNumbers: { type: "array", items: { type: "number" } },
                    drawTime: { type: "string" },
                  },
                  required: ["gameType", "drawDate", "mainNumbers", "specialNumbers", "drawTime"],
                  additionalProperties: false,
                },
              },
            },
            required: ["draws"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const parsed = JSON.parse(text);

    let insertedCount = 0;
    let skippedCount = 0;

    for (const draw of parsed.draws) {
      const gt = draw.gameType as GameType;
      if (!FLORIDA_GAMES[gt]) {
        skippedCount++;
        continue;
      }

      try {
        await insertDrawResult({
          gameType: gt,
          drawDate: new Date(draw.drawDate).getTime(),
          mainNumbers: draw.mainNumbers,
          specialNumbers: draw.specialNumbers || [],
          drawTime: draw.drawTime || "evening",
          source: "pdf_upload",
        });
        insertedCount++;
      } catch (e) {
        skippedCount++;
      }
    }

    await updatePdfUploadStatus(uploadId, "completed", {
      drawsExtracted: insertedCount,
      errorMessage: skippedCount > 0 ? `${skippedCount} draws skipped (duplicates or invalid)` : null,
    });

    console.log(`[PDF Upload] Processed upload ${uploadId}: ${insertedCount} draws extracted, ${skippedCount} skipped`);
  } catch (err: any) {
    console.error("[PDF Upload] LLM processing failed:", err);
    await updatePdfUploadStatus(uploadId, "failed", {
      errorMessage: err?.message || "Failed to extract numbers from PDF",
    });
  }
}

// ─── Ticket Image → LLM Vision ─────────────────────────────────────────────

async function processTicketImageWithLLM(
  fileUrl: string,
  _mimeType: string
): Promise<{
  gameType: string;
  drawDate: string;
  drawTime: "midday" | "evening";
  mainNumbers: number[];
  specialNumbers: number[];
}> {
  const gameTypeList = GAME_TYPES.map(gt => {
    const cfg = FLORIDA_GAMES[gt];
    return `${gt}: ${cfg.name} (${cfg.mainCount} main numbers${cfg.isDigitGame ? " digits 0-9" : ` 1-${cfg.mainMax}`}${cfg.specialCount > 0 ? `, ${cfg.specialCount} special 1-${cfg.specialMax}` : ""})`;
  }).join("\n");

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a precise data extraction assistant. Extract the Florida Lottery ticket numbers from the provided image. Return ONLY valid JSON.
Today is ${new Date().toISOString().split("T")[0]}.
Available game types:
${gameTypeList}`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url" as const,
            image_url: { url: fileUrl, detail: "high" },
          },
          {
            type: "text" as const,
            text: `From this ticket image, determine:
1. The game type (one of: ${GAME_TYPES.join(", ")})
2. The draw date (YYYY-MM-DD)
3. Whether the draw is midday or evening (drawTime must be either "midday" or "evening")
4. The main number set (mainNumbers must have the exact count required by the selected game)
5. Any special/bonus number set (specialNumbers must have the exact count required by the selected game, or be [] if that game has no special numbers)
Return JSON with exactly:
{ "gameType": "string", "drawDate": "YYYY-MM-DD", "drawTime": "midday" | "evening", "mainNumbers": number[], "specialNumbers": number[] }
Important:
- mainNumbers length must match the selected game's mainCount.
- specialNumbers length must match the selected game's specialCount (or be [] if specialCount is 0).`,
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ticket_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            gameType: { type: "string" },
            drawDate: { type: "string" },
            drawTime: { type: "string", enum: ["midday", "evening"] },
            mainNumbers: { type: "array", items: { type: "number" } },
            specialNumbers: { type: "array", items: { type: "number" } },
          },
          required: ["gameType", "drawDate", "drawTime", "mainNumbers", "specialNumbers"],
        },
      },
    },
  });

  const content = result.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const parsed = JSON.parse(text) as {
    gameType: string;
    drawDate: string;
    drawTime: "midday" | "evening";
    mainNumbers: number[];
    specialNumbers: number[];
  };

  const mainNumbers = (parsed.mainNumbers || []).map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n));
  const specialNumbers = (parsed.specialNumbers || []).map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n));

  return {
    gameType: String(parsed.gameType),
    drawDate: String(parsed.drawDate),
    drawTime: parsed.drawTime,
    mainNumbers,
    specialNumbers,
  };
}
