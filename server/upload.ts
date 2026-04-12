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

function registerUploadRoutes(app: Express) {
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

  // ... (other routes remain unchanged for brevity)
}

// ─── Background PDF Processing ──────────────────────────────────────────────

export async function processPdfWithLLM(
  uploadId: number,
  fileUrl: string,
  fileDataBase64: string,
  gameType: string | null
) {
  const startedAt = new Date().toISOString();
  let pdfParseFailed = false;
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
      console.error("[PDF Upload] pdf-parse failed:", parseErr);
      pdfParseFailed = true;
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

    // Step 4: Fallback to OpenAI OCR only if deterministic parsing failed
    let providerAttempted = "deterministic_pdf_text_parser";
    let providerSucceeded = draws.length > 0;
    let fallbackUsed = false;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let fallbackNote: string | null = null;

    if (draws.length === 0 && pdfParseFailed) {
      const hasOpenAiCredentials = Boolean(ENV.openAiApiKey && ENV.openAiApiKey.trim().length > 0);
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
          console.warn("[PDF Upload] OpenAI OCR fallback failed:", fallbackErr);
        }
      }
    } else if (draws.length === 0) {
      errorCode = "deterministic_parser_failed";
      errorMessage = "PDF format change detected; deterministic parser failed";
      console.warn("[PDF Upload] Deterministic parser failed, but not falling back to OpenAI");
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
