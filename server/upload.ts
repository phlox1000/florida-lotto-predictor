import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { insertPdfUpload, updatePdfUploadStatus, insertDrawResult } from "./db";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { createContext } from "./_core/context";

/**
 * Register the PDF upload route on the Express app.
 * This uses multipart form data with the built-in express body parser.
 */
export function registerUploadRoutes(app: Express) {
  app.post("/api/upload-pdf", async (req: Request, res: Response) => {
    try {
      // Authenticate the user
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      // Only admin can upload
      if (ctx.user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      // Read the raw body as base64 from JSON payload
      const { fileName, fileData, gameType } = req.body as {
        fileName: string;
        fileData: string; // base64 encoded PDF
        gameType?: string;
      };

      if (!fileName || !fileData) {
        res.status(400).json({ error: "fileName and fileData (base64) are required" });
        return;
      }

      // Decode base64 to buffer
      const pdfBuffer = Buffer.from(fileData, "base64");

      if (pdfBuffer.length > 16 * 1024 * 1024) {
        res.status(400).json({ error: "File too large. Maximum 16MB." });
        return;
      }

      // Upload to S3
      const fileKey = `pdf-uploads/${ctx.user.id}-${nanoid(8)}-${fileName}`;
      const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Record in database
      const uploadId = await insertPdfUpload({
        userId: ctx.user.id,
        fileName,
        fileUrl,
        fileKey,
        gameType: gameType || null,
        status: "processing",
      });

      // Process the PDF asynchronously using LLM
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
}

/**
 * Process a PDF by sending its content to the LLM for number extraction,
 * then insert the extracted draws into the database.
 */
async function processPdfWithLLM(
  uploadId: number,
  fileUrl: string,
  fileDataBase64: string,
  gameType: string | null
) {
  try {
    // Use LLM with the PDF file to extract lottery numbers
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
