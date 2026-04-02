import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  extractPdfDrawsWithOpenAI,
  extractTicketFromImageWithOpenAI,
  getRecentOpenAiOcrLogs,
} from "./_core/openai-ocr";
import { getDatabaseDiagnostics, probeDatabaseConnection } from "./db";
import { FLORIDA_GAMES, GAME_TYPES } from "@shared/lottery";

function buildGameTypeHint(): string {
  return GAME_TYPES.map(gt => {
    const cfg = FLORIDA_GAMES[gt];
    return `${gt}: ${cfg.name} (${cfg.mainCount} main${cfg.specialCount ? ` + ${cfg.specialCount} special` : ""})`;
  }).join("\n");
}

function parseBody(req: Request): { imageUrl?: string; pdfUrl?: string } {
  const body = (req.body || {}) as Record<string, unknown>;
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const pdfUrl = typeof body.pdfUrl === "string" ? body.pdfUrl.trim() : "";
  return {
    imageUrl: imageUrl || undefined,
    pdfUrl: pdfUrl || undefined,
  };
}

export function registerOpenAiOcrProofRoute(app: Express) {
  const activeProofEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_OPENAI_OCR_PROOF_ROUTE === "true";

  const safeStatusPayload = {
    hasOpenAiApiKey: Boolean(ENV.openAiApiKey),
    model: ENV.openAiModel,
    openAiBaseUrlConfigured: Boolean(process.env.OPENAI_BASE_URL),
    routeMounted: true,
  };

  const buildSanitizedTrace = () =>
    getRecentOpenAiOcrLogs(20).map(record => {
      const detail = (record.detail || {}) as Record<string, unknown>;
      return {
        stage: record.stage,
        timestamp: record.timestamp,
        model: record.model,
        endpoint: typeof detail.endpoint === "string" ? detail.endpoint : null,
        responseId: typeof detail.responseId === "string" ? detail.responseId : null,
        fallbackUsed: typeof detail.fallbackUsed === "boolean" ? detail.fallbackUsed : null,
        reason: typeof detail.reason === "string" ? detail.reason : null,
        fromModel: typeof detail.fromModel === "string" ? detail.fromModel : null,
        toModel: typeof detail.toModel === "string" ? detail.toModel : null,
        reasons: Array.isArray(detail.reasons) ? detail.reasons : null,
        errorMessage: typeof detail.message === "string" ? detail.message : null,
      };
    });

  // Always expose this safe status endpoint, including production.
  app.get("/api/debug/openai-ocr-proof", (_req: Request, res: Response) => {
    res.json({
      ...safeStatusPayload,
      recentOcrTrace: buildSanitizedTrace(),
    });
  });

  app.get("/api/debug/db-health", async (_req: Request, res: Response) => {
    const diagnostics = getDatabaseDiagnostics();
    const probe = await probeDatabaseConnection();
    res.json({
      ...diagnostics,
      dbConnected: probe.dbConnected,
      lastDbError: probe.lastDbError,
    });
  });

  app.post("/api/debug/openai-ocr-proof", async (req: Request, res: Response) => {
    if (!activeProofEnabled) {
      res.status(403).json({
        ...safeStatusPayload,
        error:
          "Active OCR proof is disabled in production. Use GET /api/debug/openai-ocr-proof for safe status.",
      });
      return;
    }

    const { imageUrl, pdfUrl } = parseBody(req);
    if (!imageUrl && !pdfUrl) {
      res.status(400).json({
        error: "imageUrl or pdfUrl is required",
      });
      return;
    }

    const gameTypeListHint = buildGameTypeHint();
    const payload: Record<string, unknown> = {
      environment: {
        hasOpenAiApiKey: Boolean(ENV.openAiApiKey),
        model: ENV.openAiModel,
        usesClientEnvVar: Boolean(process.env.VITE_OPENAI_API_KEY),
      },
      inputs: {
        imageUrl: imageUrl || null,
        pdfUrl: pdfUrl || null,
      },
    };

    if (imageUrl) {
      try {
        payload.ticketExtraction = await extractTicketFromImageWithOpenAI({
          imageUrl,
          gameTypeListHint,
        });
      } catch (error) {
        payload.ticketExtractionError =
          error instanceof Error ? error.message : String(error);
      }
    }

    if (pdfUrl) {
      try {
        payload.pdfExtraction = await extractPdfDrawsWithOpenAI({
          pdfUrl,
          gameHint: "Infer the game type from visible PDF content.",
          gameTypeListHint,
        });
      } catch (error) {
        payload.pdfExtractionError =
          error instanceof Error ? error.message : String(error);
      }
    }

    payload.ocrTraceLogs = getRecentOpenAiOcrLogs(40);
    res.json(payload);
  });
}
