import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  extractPdfDrawsWithOpenAI,
  extractTicketFromImageWithOpenAI,
  getRecentOpenAiOcrLogs,
} from "./_core/openai-ocr";
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
  app.post("/api/debug/openai-ocr-proof", async (req: Request, res: Response) => {
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
