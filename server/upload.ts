import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";
import {
  insertPdfUpload,
  updatePdfUploadStatus,
  insertDrawResult,
  insertPurchasedTicket,
  insertScannedTicket,
  insertScannedTicketRow,
  getUserPredictionsByGame,
  getDrawResultByGameDateTime,
  evaluatePurchasedTicketsAgainstDraw,
} from "./db";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { createContext } from "./_core/context";
import { getPersonalizationImpactSummary } from "./personalization-metrics";
import {
  extractPdfDrawsWithOpenAI,
  extractTicketFromImageWithOpenAI,
  getRecentOpenAiOcrLogs,
} from "./_core/openai-ocr";
import {
  recordAiObservability,
  safeShortErrorCode,
} from "./_core/ai-observability";
import {
  decodeBase64PayloadToBuffer,
  detectImageMimeType,
  isPdfBuffer,
  stripDataUrlPrefix,
} from "./upload-validation";
import { checkRateLimit } from "./_core/rate-limit";

function sanitizeUploadPayload(value: unknown): Record<string, unknown> {
  const obj = (value && typeof value === "object") ? (value as Record<string, unknown>) : {};
  return {
    fileName: typeof obj.fileName === "string" ? obj.fileName : null,
    fileDataLength:
      typeof obj.fileData === "string"
        ? obj.fileData.length
        : null,
    gameType: typeof obj.gameType === "string" ? obj.gameType : null,
    cost:
      typeof obj.cost === "number" || typeof obj.cost === "string"
        ? Number(obj.cost)
        : null,
  };
}

function sanitizeSafeFilename(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

function firstForwardedValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

export function resolvePublicFileUrlForOcr(req: Request, fileUrl: string): string {
  if (typeof fileUrl !== "string" || fileUrl.trim().length === 0) {
    return fileUrl;
  }
  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const forwardedProto = firstForwardedValue(req.headers["x-forwarded-proto"]);
  const forwardedHost = firstForwardedValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost || req.get("host");
  if (!host) return fileUrl;
  const protocol = forwardedProto || req.protocol || "https";
  const normalizedPath = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  return `${protocol}://${host}${normalizedPath}`;
}

function parseIsoDateToUtcStart(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * Register all upload routes on the Express app.
 */
export function registerUploadRoutes(app: Express) {
  // ─── Personalization Metrics (REST alias) ────────────────────────────────
  app.get("/metrics/personalization-impact", async (req: Request, res: Response) => {
    try {
      const gameTypeRaw = typeof req.query.gameType === "string" ? req.query.gameType : undefined;
      const gameType = gameTypeRaw && GAME_TYPES.includes(gameTypeRaw as any) ? gameTypeRaw : undefined;
      if (gameTypeRaw && !gameType) {
        res.status(400).json({ error: "Invalid gameType" });
        return;
      }
      const lookbackRaw = typeof req.query.lookbackDays === "string" ? Number(req.query.lookbackDays) : undefined;
      const lookbackDays = Number.isFinite(lookbackRaw) && lookbackRaw! >= 1 && lookbackRaw! <= 365
        ? Math.floor(lookbackRaw!)
        : undefined;
      if (req.query.lookbackDays !== undefined && lookbackDays === undefined) {
        res.status(400).json({ error: "Invalid lookbackDays (expected 1-365)" });
        return;
      }
      const summary = await getPersonalizationImpactSummary({
        gameType,
        lookbackDays,
      });
      res.json(summary);
    } catch (error) {
      console.warn("[Metrics] personalization-impact endpoint failed:", error);
      res.status(500).json({ error: "Failed to load personalization impact metrics" });
    }
  });

  // ─── PDF Upload (Admin) ──────────────────────────────────────────────────
  app.post("/api/upload-pdf", async (req: Request, res: Response) => {
    try {
      const limiter = checkRateLimit({
        scope: "upload-pdf",
        req,
        max: 20,
        windowMs: 60_000,
      });
      if (!limiter.allowed) {
        res.status(429).json({
          success: false,
          error: `Rate limit exceeded. Retry in ${limiter.retryAfterSeconds}s.`,
        });
        return;
      }
      console.info("[API START]", {
        endpoint: "/api/upload-pdf",
        operation: "pdf_uploads.insert",
        payload: sanitizeUploadPayload(req.body),
      });
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }
      if (ctx.user.role !== "admin") {
        res.status(403).json({ success: false, error: "Admin access required" });
        return;
      }

      const { fileName, fileData, gameType } = req.body as {
        fileName: string;
        fileData: string;
        gameType?: string;
      };

      if (!fileName || !fileData) {
        res.status(400).json({ success: false, error: "fileName and fileData (base64) are required" });
        return;
      }
      const safeFileName = sanitizeSafeFilename(fileName);
      if (!safeFileName) {
        res.status(400).json({ success: false, error: "Invalid fileName" });
        return;
      }
      const normalizedGameType =
        typeof gameType === "string" && GAME_TYPES.includes(gameType as GameType)
          ? (gameType as GameType)
          : undefined;
      if (typeof gameType === "string" && !normalizedGameType) {
        res.status(400).json({ success: false, error: "Invalid gameType" });
        return;
      }

      const pdfBuffer = decodeBase64PayloadToBuffer(fileData);
      if (!pdfBuffer) {
        res.status(400).json({ success: false, error: "Invalid PDF payload. Please upload a valid PDF file." });
        return;
      }
      if (pdfBuffer.length > 16 * 1024 * 1024) {
        res.status(400).json({ success: false, error: "File too large. Maximum 16MB." });
        return;
      }
      if (!isPdfBuffer(pdfBuffer)) {
        res.status(400).json({ success: false, error: "Unsupported file type. Please upload a valid PDF file." });
        return;
      }

      const fileKey = `pdf-uploads/${ctx.user.id}-${nanoid(8)}-${safeFileName}`;
      const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");
      const ocrFileUrl = resolvePublicFileUrlForOcr(req, fileUrl);

      const uploadId = await insertPdfUpload({
        userId: ctx.user.id,
        fileName: safeFileName,
        fileUrl,
        fileKey,
        gameType: normalizedGameType || null,
        status: "processing",
      });

      console.info("[DB WRITE]", {
        endpoint: "/api/upload-pdf",
        operation: "pdf_uploads.insert",
        uploadId,
        userId: ctx.user.id,
      });

      processPdfWithLLM(uploadId, ocrFileUrl, pdfBuffer.toString("base64"), normalizedGameType || null)
        .catch(err => console.error("[PDF Upload] Background processing failed:", err));

      res.json({
        success: true,
        uploadId,
        fileUrl,
        status: "processing",
        message: "PDF uploaded and queued for processing. Numbers will be extracted shortly.",
        data: {
          uploadId,
          fileUrl,
          status: "processing",
          message: "PDF uploaded and queued for processing. Numbers will be extracted shortly.",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ERROR]", {
        endpoint: "/api/upload-pdf",
        operation: "pdf_uploads.insert",
        payload: sanitizeUploadPayload(req.body),
        message,
      });
      res.status(500).json({ success: false, error: "Upload failed" });
    }
  });

  // ─── Ticket Scan (Image → LLM Vision) ──────────────────────────────────
  app.post("/api/upload-ticket", async (req: Request, res: Response) => {
    try {
      const limiter = checkRateLimit({
        scope: "upload-ticket",
        req,
        max: 30,
        windowMs: 60_000,
      });
      if (!limiter.allowed) {
        res.status(429).json({
          success: false,
          error: `Rate limit exceeded. Retry in ${limiter.retryAfterSeconds}s.`,
        });
        return;
      }
      console.info("[API START]", {
        endpoint: "/api/upload-ticket",
        operation: "scanned_tickets.insert",
        payload: sanitizeUploadPayload(req.body),
      });
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ success: false, error: "Authentication required" });
        return;
      }

      const { fileName, fileData, cost } = req.body as {
        fileName: string;
        fileData: string; // base64 (may include data-url prefix)
        cost: number | string;
      };

      if (!fileName || !fileData) {
        res.status(400).json({ success: false, error: "fileName and fileData (base64) are required" });
        return;
      }
      const safeFileName = sanitizeSafeFilename(fileName);
      if (!safeFileName) {
        res.status(400).json({ success: false, error: "Invalid fileName" });
        return;
      }

      const numericCost = Number(cost);
      if (!Number.isFinite(numericCost) || numericCost < 0) {
        res.status(400).json({ success: false, error: "cost must be a non-negative number" });
        return;
      }

      const imgBuffer = decodeBase64PayloadToBuffer(fileData);
      if (!imgBuffer) {
        res.status(400).json({ success: false, error: "Invalid image payload. Please upload a valid ticket image." });
        return;
      }
      if (imgBuffer.length > 10 * 1024 * 1024) {
        res.status(400).json({ success: false, error: "Image too large. Maximum 10MB." });
        return;
      }

      // Upload image to S3 so the LLM can access it via URL
      const mimeType = detectImageMimeType(imgBuffer);
      if (!mimeType) {
        res.status(400).json({ success: false, error: "Unsupported image format. Please upload PNG, JPEG, or WEBP." });
        return;
      }
      const fileKey = `ticket-scans/${ctx.user.id}-${nanoid(8)}-${safeFileName}`;
      const { url: fileUrl } = await storagePut(fileKey, imgBuffer, mimeType);
      const ocrFileUrl = resolvePublicFileUrlForOcr(req, fileUrl);

      // Use LLM vision to extract ticket data
      const extractedResult = await processTicketImageWithLLM(ocrFileUrl, mimeType);
      const extracted = extractedResult.extracted;

      const gameType = extracted.gameType as GameType;
      const cfg = FLORIDA_GAMES[gameType];
      if (!cfg) {
        res.status(400).json({ success: false, error: "Could not determine game type from ticket" });
        return;
      }

      const drawDateTs = parseIsoDateToUtcStart(extracted.drawDate);
      if (!Number.isFinite(drawDateTs)) {
        res.status(400).json({ success: false, error: "Invalid drawDate extracted from ticket" });
        return;
      }

      const drawTime = extracted.drawTime.toLowerCase() as "midday" | "evening";
      if (drawTime !== "midday" && drawTime !== "evening") {
        res.status(400).json({ success: false, error: "Invalid drawTime extracted from ticket" });
        return;
      }

      const ticketMain = extracted.mainNumbers.slice().sort((a, b) => a - b);
      const ticketSpecial = (extracted.specialNumbers || []).slice().sort((a, b) => a - b);

      // Validate counts and ranges
      if (ticketMain.length !== cfg.mainCount) {
        res.status(400).json({ success: false, error: `Unexpected main number count (got ${ticketMain.length}, expected ${cfg.mainCount})` });
        return;
      }

      if (cfg.isDigitGame) {
        if (ticketMain.some(n => n < 0 || n > 9)) {
          res.status(400).json({ success: false, error: "Digit game main numbers must be in range 0-9" });
          return;
        }
      } else {
        if (new Set(ticketMain).size !== ticketMain.length) {
          res.status(400).json({ success: false, error: "Main numbers must be unique for this game" });
          return;
        }
        if (ticketMain.some(n => n < 1 || n > cfg.mainMax)) {
          res.status(400).json({ success: false, error: "Main numbers out of range" });
          return;
        }
      }

      let normalizedSpecial: number[] = [];
      if (cfg.specialCount > 0) {
        if (ticketSpecial.length !== cfg.specialCount) {
          res.status(400).json({ success: false, error: `Unexpected special number count (got ${ticketSpecial.length}, expected ${cfg.specialCount})` });
          return;
        }
        normalizedSpecial = ticketSpecial;
        if (new Set(normalizedSpecial).size !== normalizedSpecial.length) {
          res.status(400).json({ success: false, error: "Special numbers must be unique" });
          return;
        }
        if (normalizedSpecial.some(n => n < 1 || n > cfg.specialMax)) {
          res.status(400).json({ success: false, error: "Special numbers out of range" });
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

      const matchModelSource = bestMatch?.modelName ?? null;
      const confidence =
        bestMatch && cfg.mainCount > 0
          ? Math.max(0, Math.min(1, (bestMatch.mainHits / cfg.mainCount) + (bestMatch.specialHits * 0.1)))
          : 0.5;

      const scannedTicketId = await insertScannedTicket({
        userId: ctx.user.id,
        gameType,
        drawDate: drawDateTs,
        drawTime,
        sourceType: "scanned_ticket",
        ticketOrigin: "unknown",
        scanStatus: "parsed",
        confirmationStatus: "pending",
        imageUrl: fileUrl,
        fileKey,
        parsedPayload: {
          extracted: {
            gameType,
            gameName: cfg.name,
            drawDate: extracted.drawDate,
            drawTime,
            mainNumbers: ticketMain,
            specialNumbers: normalizedSpecial,
          },
          matchedModel: matchModelSource,
          confidence,
          inferredCost: numericCost,
        },
      });

      const scannedTicketRowId = await insertScannedTicketRow({
        scannedTicketId,
        rowIndex: 0,
        gameType,
        drawDate: drawDateTs,
        drawTime,
        parsedMainNumbers: ticketMain,
        parsedSpecialNumbers: normalizedSpecial,
        rowStatus: "parsed",
      });

      console.info("[DB WRITE]", {
        endpoint: "/api/upload-ticket",
        operation: "scanned_tickets.insert",
        scannedTicketId,
        scannedTicketRowId,
        userId: ctx.user.id,
      });

      res.json({
        success: true,
        scannedTicketId,
        requiresConfirmation: true,
        cost: numericCost,
        aiObservability: extractedResult.aiObservability,
        rows: [
          {
            rowId: scannedTicketRowId,
            rowIndex: 0,
            mainNumbers: ticketMain,
            specialNumbers: normalizedSpecial,
            rowStatus: "parsed",
          },
        ],
        extracted: {
          gameType,
          gameName: cfg.name,
          drawDate: extracted.drawDate,
          drawTime,
          mainNumbers: ticketMain,
          specialNumbers: normalizedSpecial,
        },
        matchedModel: matchModelSource,
        imageUrl: fileUrl,
        data: {
          scannedTicketId,
          requiresConfirmation: true,
          cost: numericCost,
          aiObservability: extractedResult.aiObservability,
          rows: [
            {
              rowId: scannedTicketRowId,
              rowIndex: 0,
              mainNumbers: ticketMain,
              specialNumbers: normalizedSpecial,
              rowStatus: "parsed",
            },
          ],
          extracted: {
            gameType,
            gameName: cfg.name,
            drawDate: extracted.drawDate,
            drawTime,
            mainNumbers: ticketMain,
            specialNumbers: normalizedSpecial,
          },
          matchedModel: matchModelSource,
          imageUrl: fileUrl,
        },
      });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ERROR]", {
        endpoint: "/api/upload-ticket",
        operation: "scanned_tickets.insert",
        payload: sanitizeUploadPayload(req.body),
        message,
      });
      res.status(502).json({
        success: false,
        error: "Failed to scan ticket image. Please try again with a clearer photo.",
      });
    }
  });

  // ─── Manual Ticket Entry ────────────────────────────────────────────────
  app.post("/api/manual-ticket", async (req: Request, res: Response) => {
    try {
      console.info("[API START]", {
        endpoint: "/api/manual-ticket",
        operation: "purchased_tickets.insert",
      });
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ success: false, error: "Authentication required" });
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
        res.status(400).json({ success: false, error: "Invalid game type" });
        return;
      }

      const drawDateTs = new Date(drawDate).getTime();
      if (!Number.isFinite(drawDateTs)) {
        res.status(400).json({ success: false, error: "Invalid draw date" });
        return;
      }

      const normalizedDrawTime = (drawTime || "evening").toLowerCase() as "midday" | "evening";
      const sanitizedNotes =
        typeof notes === "string" ? notes.trim().slice(0, 1000) : "";
      const sanitizedModelSource =
        typeof modelSource === "string" ? modelSource.trim().slice(0, 120) : undefined;
      const ticketNotes = `Draw period: ${normalizedDrawTime}\nManual entry: ${new Date().toISOString()}${sanitizedNotes ? `\n${sanitizedNotes}` : ""}`;

      const ticketId = await insertPurchasedTicket({
        userId: ctx.user.id,
        gameType: gameType as GameType,
        mainNumbers,
        specialNumbers: specialNumbers || [],
        purchaseDate: Date.now(),
        drawDate: drawDateTs,
        cost: Number(cost) || 0,
        notes: ticketNotes,
        modelSource: sanitizedModelSource,
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
        data: {
          ticketId,
          evaluatedNow,
        },
      });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ERROR]", {
        endpoint: "/api/manual-ticket",
        operation: "purchased_tickets.insert",
        message,
      });
      res.status(500).json({ success: false, error: "Manual ticket entry failed" });
    }
  });
}

// ─── Background PDF Processing ──────────────────────────────────────────────

// ─── Game type detection from PDF header text ────────────────────────────────
const GAME_NAME_MAP: Record<string, GameType> = {
  "FANTASY 5": "fantasy_5",
  "POWERBALL": "powerball",
  "MEGA MILLIONS": "mega_millions",
  "FLORIDA LOTTO": "florida_lotto",
  "CASH4LIFE": "cash4life",
  "CASH 4 LIFE": "cash4life",
  "PICK 2": "pick_2",
  "PICK 3": "pick_3",
  "PICK 4": "pick_4",
  "PICK 5": "pick_5",
};

function detectGameTypeFromText(text: string): GameType | null {
  const upper = text.toUpperCase();
  for (const [name, gt] of Object.entries(GAME_NAME_MAP)) {
    if (upper.includes(name)) return gt;
  }
  return null;
}

function normalizeDate(dateStr: string): string {
  // Handles M/D/YY or M/D/YYYY → YYYY-MM-DD
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  let [month, day, year] = parts;
  let y = parseInt(year, 10);
  if (y < 100) {
    // 2-digit year: 00-49 → 2000s, 50-99 → 1900s
    y = y < 50 ? 2000 + y : 1900 + y;
  }
  return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Deterministic text-based parser for FL Lottery PDF exports.
 * These PDFs have a very consistent structure:
 *   date line → draw type (EVENING/MIDDAY) → N number lines
 * Repeated for every draw, with page headers interspersed.
 */
function parseFLLotteryPdfText(
  text: string,
  gameType: GameType,
): Array<{ gameType: GameType; drawDate: string; drawTime: string; mainNumbers: number[]; specialNumbers: number[] }> {
  const cfg = FLORIDA_GAMES[gameType];
  if (!cfg) return [];

  const totalNumbersPerDraw = cfg.mainCount + cfg.specialCount;
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const dateRe = /^(\d{1,2}\/\d{1,2}\/\d{2,4})$/;
  const drawTypeRe = /^(EVENING|MIDDAY)$/;

  const draws: Array<{ gameType: GameType; drawDate: string; drawTime: string; mainNumbers: number[]; specialNumbers: number[] }> = [];
  let i = 0;

  while (i < lines.length) {
    const dm = dateRe.exec(lines[i]);
    if (dm) {
      const dateStr = normalizeDate(dm[1]);
      i++;
      if (i < lines.length) {
        const dtm = drawTypeRe.exec(lines[i]);
        if (dtm) {
          const drawTime = dtm[1].toLowerCase();
          i++;
          const nums: number[] = [];
          while (i < lines.length && nums.length < totalNumbersPerDraw + 2) {
            // Allow digits 0-9 for digit games, multi-digit for regular games
            if (/^\d+$/.test(lines[i])) {
              nums.push(parseInt(lines[i], 10));
              i++;
            } else {
              break;
            }
          }
          if (nums.length >= totalNumbersPerDraw) {
            const mainNumbers = nums.slice(0, cfg.mainCount);
            const specialNumbers = cfg.specialCount > 0
              ? nums.slice(cfg.mainCount, cfg.mainCount + cfg.specialCount)
              : [];
            draws.push({ gameType, drawDate: dateStr, drawTime, mainNumbers, specialNumbers });
          }
          continue;
        }
      }
    }
    i++;
  }

  return draws;
}

export async function processPdfWithLLM(
  uploadId: number,
  fileUrl: string,
  fileDataBase64: string,
  gameType: string | null
) {
  const startedAt = new Date().toISOString();
  try {
    // Step 1: Extract text from PDF using pdf-parse
    const normalizedPdfBase64 = stripDataUrlPrefix(String(fileDataBase64));
    const pdfBuffer = Buffer.from(normalizedPdfBase64, "base64");
    let pdfText = "";
    try {
      const pdfParseModule = await import("pdf-parse") as any;
      if (typeof pdfParseModule?.default === "function") {
        const pdfData = await pdfParseModule.default(pdfBuffer);
        pdfText = typeof pdfData?.text === "string" ? pdfData.text : "";
      } else if (typeof pdfParseModule?.PDFParse === "function") {
        // pdf-parse v2+ exports PDFParse class instead of default function.
        const parser = new pdfParseModule.PDFParse({ data: pdfBuffer });
        try {
          const pdfData = await parser.getText();
          pdfText = typeof pdfData?.text === "string" ? pdfData.text : "";
        } finally {
          if (typeof parser.destroy === "function") {
            await parser.destroy();
          }
        }
      } else {
        throw new Error("Unsupported pdf-parse module shape");
      }
    } catch (parseErr) {
      console.error("[PDF Upload] pdf-parse failed, will try LLM fallback:", parseErr);
    }

    // Step 2: Detect game type from PDF header if not provided
    const detectedGame = gameType as GameType || detectGameTypeFromText(pdfText);

    // Step 3: Try deterministic text parser first (fast, accurate for FL Lottery PDFs)
    let draws: Array<{ gameType: string; drawDate: string; drawTime: string; mainNumbers: number[]; specialNumbers: number[] }> = [];

    if (pdfText && detectedGame && FLORIDA_GAMES[detectedGame]) {
      console.log(`[PDF Upload] Attempting deterministic parse for ${detectedGame}...`);
      draws = parseFLLotteryPdfText(pdfText, detectedGame);
      console.log(`[PDF Upload] Deterministic parser found ${draws.length} draws`);
    }

    // Step 4: Optional OpenAI OCR fallback only when deterministic parsing found nothing
    let providerAttempted = "deterministic_pdf_text_parser";
    let providerSucceeded = draws.length > 0;
    let fallbackUsed = false;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let fallbackNote: string | null = null;
    if (draws.length === 0) {
      const hasOpenAiCredentials = Boolean(
        ENV.openAiApiKey && ENV.openAiApiKey.trim().length > 0
      );
      if (!hasOpenAiCredentials) {
        providerAttempted = "openai_ocr_fallback";
        providerSucceeded = false;
        fallbackUsed = true;
        errorCode = "missing_openai_api_key";
        fallbackNote = "OpenAI OCR fallback skipped: missing OPENAI_API_KEY";
        console.warn("[PDF Upload] Skipping OpenAI OCR fallback - missing OPENAI_API_KEY");
      } else if (pdfText.length >= 50000) {
        providerAttempted = "openai_ocr_fallback";
        providerSucceeded = false;
        fallbackUsed = true;
        errorCode = "pdf_text_too_large_for_fallback";
        fallbackNote = "OpenAI OCR fallback skipped: extracted text is too large";
        console.warn("[PDF Upload] Skipping OpenAI OCR fallback - extracted text too large");
      } else {
        try {
          providerAttempted = "openai_ocr_fallback";
          fallbackUsed = true;
          console.log("[PDF Upload] Falling back to OpenAI OCR for unstructured PDF...");
          draws = await parsePdfWithLLMFallback(fileUrl, gameType);
          providerSucceeded = draws.length > 0;
          if (!providerSucceeded) {
            errorCode = "openai_ocr_returned_no_draws";
          }
        } catch (fallbackErr) {
          providerSucceeded = false;
          errorCode = safeShortErrorCode((fallbackErr as Error)?.name || "openai_ocr_fallback_failed");
          errorMessage = String((fallbackErr as Error)?.message || "").slice(0, 220) || null;
          fallbackNote = "OpenAI OCR fallback failed";
          console.warn("[PDF Upload] OpenAI OCR fallback failed; completing without extracted draws:", fallbackErr);
        }
      }
    }

    // Step 5: Insert draws into database
    let insertedCount = 0;
    let skippedCount = 0;

    for (const draw of draws) {
      const gt = draw.gameType as GameType;
      if (!FLORIDA_GAMES[gt]) {
        skippedCount++;
        continue;
      }

      try {
        const insertResult = await insertDrawResult({
          gameType: gt,
          drawDate: new Date(draw.drawDate).getTime(),
          mainNumbers: draw.mainNumbers,
          specialNumbers: draw.specialNumbers || [],
          drawTime: draw.drawTime || "evening",
          source: "pdf_upload",
        });
        if (insertResult.status === "inserted") insertedCount++;
        else skippedCount++;
      } catch (e) {
        skippedCount++;
      }
    }

    const completionMessage =
      skippedCount > 0
        ? `${skippedCount} draws skipped (duplicates or invalid)`
        : insertedCount === 0 && fallbackNote
          ? fallbackNote
          : null;

    await updatePdfUploadStatus(uploadId, "completed", {
      drawsExtracted: insertedCount,
      errorMessage: completionMessage,
    });
    const latestOcrLog = getRecentOpenAiOcrLogs(1)[0];
    recordAiObservability({
      feature: "upload-pdf-ocr",
      providerAttempted,
      providerSucceeded,
      fallbackUsed,
      timestamp: startedAt,
      errorCode,
      errorMessage,
      detail: {
        uploadId,
        insertedCount,
        skippedCount,
        gameType: gameType || null,
        latestOcrStage: latestOcrLog?.stage ?? null,
      },
    });

    console.log(`[PDF Upload] Processed upload ${uploadId}: ${insertedCount} draws extracted, ${skippedCount} skipped`);
  } catch (err: any) {
    console.error("[PDF Upload] Processing failed:", err);
    recordAiObservability({
      feature: "upload-pdf-ocr",
      providerAttempted: "deterministic_pdf_text_parser",
      providerSucceeded: false,
      fallbackUsed: false,
      timestamp: startedAt,
      errorCode: safeShortErrorCode(err?.name || "upload_pdf_processing_failed"),
      errorMessage: String(err?.message || "Failed to process uploaded PDF").slice(0, 220),
      detail: { uploadId, gameType: gameType || null },
    });
    await updatePdfUploadStatus(uploadId, "failed", {
      errorMessage: err?.message || "Failed to extract numbers from PDF",
    });
  }
}

/** OpenAI OCR fallback for small/unstructured PDFs */
async function parsePdfWithLLMFallback(
  fileUrl: string,
  gameType: string | null
): Promise<Array<{ gameType: string; drawDate: string; drawTime: string; mainNumbers: number[]; specialNumbers: number[] }>> {
  const gameTypeList = GAME_TYPES.map(gt => {
    const cfg = FLORIDA_GAMES[gt];
    return `${gt}: ${cfg.name} (${cfg.mainCount} main numbers${cfg.isDigitGame ? " digits 0-9" : ` 1-${cfg.mainMax}`}${cfg.specialCount > 0 ? `, ${cfg.specialCount} special 1-${cfg.specialMax}` : ""})`;
  }).join("\n");
  const gameHint = gameType && FLORIDA_GAMES[gameType as GameType]
    ? `Expected game (if clearly visible): ${FLORIDA_GAMES[gameType as GameType].name}.`
    : "Game type must be inferred from the PDF content.";

  return extractPdfDrawsWithOpenAI({
    pdfUrl: fileUrl,
    gameHint,
    gameTypeListHint: gameTypeList,
  });
}

// ─── Ticket Image → LLM Vision ─────────────────────────────────────────────

async function processTicketImageWithLLM(
  fileUrl: string,
  _mimeType: string
): Promise<{
  extracted: {
    gameType: string;
    drawDate: string;
    drawTime: "midday" | "evening";
    mainNumbers: number[];
    specialNumbers: number[];
  };
  aiObservability: {
    providerAttempted: string;
    providerSucceeded: boolean;
    fallbackUsed: boolean;
    timestamp: string;
    errorCode: string | null;
    errorMessage: string | null;
  };
}> {
  const timestamp = new Date().toISOString();
  try {
    const gameTypeList = GAME_TYPES.map(gt => {
      const cfg = FLORIDA_GAMES[gt];
      return `${gt}: ${cfg.name} (${cfg.mainCount} main numbers${cfg.isDigitGame ? " digits 0-9" : ` 1-${cfg.mainMax}`}${cfg.specialCount > 0 ? `, ${cfg.specialCount} special 1-${cfg.specialMax}` : ""})`;
    }).join("\n");

    const absoluteImageUrl = /^https?:\/\//i.test(fileUrl)
      ? fileUrl
      : `${String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "")}${fileUrl}`;

    const parsed = await extractTicketFromImageWithOpenAI({
      imageUrl: absoluteImageUrl,
      gameTypeListHint: gameTypeList,
    });
    const latestOcrLog = getRecentOpenAiOcrLogs(1)[0];
    const fallbackUsed =
      latestOcrLog?.stage === "ticket_fallback_success"
        ? Boolean((latestOcrLog.detail as any)?.fallbackUsed)
        : false;
    recordAiObservability({
      feature: "upload-ticket-ocr",
      providerAttempted: "openai_ocr",
      providerSucceeded: true,
      fallbackUsed,
      timestamp,
      errorCode: null,
      errorMessage: null,
      detail: {
        latestOcrStage: latestOcrLog?.stage ?? null,
      },
    });
    return {
      extracted: parsed,
      aiObservability: {
        providerAttempted: "openai_ocr",
        providerSucceeded: true,
        fallbackUsed,
        timestamp,
        errorCode: null,
        errorMessage: null,
      },
    };
  } catch (error) {
    const errorCode = safeShortErrorCode((error as Error)?.name || "openai_ticket_ocr_failed");
    const errorMessage = String((error as Error)?.message || "Ticket OCR failed").slice(0, 220);
    const latestOcrLog = getRecentOpenAiOcrLogs(1)[0];
    recordAiObservability({
      feature: "upload-ticket-ocr",
      providerAttempted: "openai_ocr",
      providerSucceeded: false,
      fallbackUsed: latestOcrLog?.stage === "ticket_fallback_failure" || latestOcrLog?.stage === "ticket_fallback_success",
      timestamp,
      errorCode,
      errorMessage,
      detail: {
        latestOcrStage: latestOcrLog?.stage ?? null,
      },
    });
    throw error;
  }
}
