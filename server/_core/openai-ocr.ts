import OpenAI from "openai";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { ENV } from "./env";

export type OpenAiTicketExtraction = {
  gameType: string;
  drawDate: string;
  drawTime: "midday" | "evening";
  mainNumbers: number[];
  specialNumbers: number[];
};

export type OpenAiPdfDraw = {
  gameType: string;
  drawDate: string;
  drawTime: "midday" | "evening";
  mainNumbers: number[];
  specialNumbers: number[];
};

export type OpenAiOcrLogRecord = {
  stage:
    | "ticket_start"
    | "ticket_request"
    | "ticket_response"
    | "ticket_validation_failed"
    | "ticket_fallback_start"
    | "ticket_fallback_success"
    | "ticket_fallback_failure"
    | "ticket_failure"
    | "pdf_start"
    | "pdf_request"
    | "pdf_response"
    | "pdf_validation_failed"
    | "pdf_fallback_start"
    | "pdf_fallback_success"
    | "pdf_fallback_failure"
    | "pdf_failure";
  timestamp: string;
  model: string;
  detail: Record<string, unknown>;
};

const ocrLogRecords: OpenAiOcrLogRecord[] = [];
const OCR_LOG_LIMIT = 80;

function pushOcrLog(record: OpenAiOcrLogRecord) {
  ocrLogRecords.push(record);
  if (ocrLogRecords.length > OCR_LOG_LIMIT) {
    ocrLogRecords.splice(0, ocrLogRecords.length - OCR_LOG_LIMIT);
  }
}

function logOcrEvent(
  stage: OpenAiOcrLogRecord["stage"],
  detail: Record<string, unknown>,
  modelOverride?: string
) {
  const payload = {
    stage,
    timestamp: new Date().toISOString(),
    model: modelOverride || ENV.openAiModel,
    detail,
  } satisfies OpenAiOcrLogRecord;
  pushOcrLog(payload);
  console.info("[OCR][OpenAI][Trace]", payload);
}

export function getRecentOpenAiOcrLogs(limit = 30): OpenAiOcrLogRecord[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 30;
  return ocrLogRecords.slice(-safeLimit);
}

function assertOpenAiApiKey() {
  if (!ENV.openAiApiKey || ENV.openAiApiKey.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY is not configured. OCR requires a server-side OpenAI API key."
    );
  }
}

function getOpenAiClient() {
  assertOpenAiApiKey();
  return new OpenAI({
    apiKey: ENV.openAiApiKey,
  });
}

type TicketValidationResult = {
  valid: boolean;
  reasons: string[];
};

type PdfValidationResult = {
  valid: boolean;
  reasons: string[];
};

class OcrContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrContentValidationError";
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeConfiguredOcrModel(raw: string | undefined, fallback: string): string {
  const value = String(raw || "").trim();
  if (!value) {
    return fallback;
  }
  return value;
}

const PRIMARY_OCR_MODEL = normalizeConfiguredOcrModel(ENV.openAiModel, "gpt-4.1-mini");
const FALLBACK_OCR_MODEL = normalizeConfiguredOcrModel(
  ENV.openAiFallbackModel,
  PRIMARY_OCR_MODEL === "gpt-4.1-mini" ? "gpt-4.1" : PRIMARY_OCR_MODEL
);

if (PRIMARY_OCR_MODEL === FALLBACK_OCR_MODEL) {
  console.warn("[OCR][OpenAI] Primary and fallback OCR models are identical; fallback escalation disabled.", {
    model: PRIMARY_OCR_MODEL,
  });
}

function parseGameType(raw: unknown): GameType | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  return (GAME_TYPES as readonly string[]).includes(value) ? (value as GameType) : null;
}

function parseIsoDateParts(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function isValidIsoDate(raw: unknown): boolean {
  const value = String(raw || "").trim();
  if (!ISO_DATE_RE.test(value)) return false;
  const parts = parseIsoDateParts(value);
  if (!parts) return false;
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  return (
    dt.getUTCFullYear() === parts.y &&
    dt.getUTCMonth() === parts.m - 1 &&
    dt.getUTCDate() === parts.d
  );
}

function validateTicketExtraction(extraction: OpenAiTicketExtraction): TicketValidationResult {
  const reasons: string[] = [];
  const gameType = parseGameType(extraction.gameType);
  if (!gameType) {
    reasons.push("missing_or_invalid_game_type");
  }

  if (!isValidIsoDate(extraction.drawDate)) {
    reasons.push("missing_or_invalid_draw_date");
  }

  if (extraction.drawTime !== "midday" && extraction.drawTime !== "evening") {
    reasons.push("missing_or_invalid_draw_time");
  }

  if (!Array.isArray(extraction.mainNumbers) || extraction.mainNumbers.length === 0) {
    reasons.push("missing_main_numbers");
  }

  if (gameType) {
    const cfg = FLORIDA_GAMES[gameType];
    const main = extraction.mainNumbers || [];
    const special = extraction.specialNumbers || [];

    if (main.length !== cfg.mainCount) {
      reasons.push("main_number_count_mismatch");
    }
    if (!main.every(n => Number.isFinite(n))) {
      reasons.push("main_numbers_non_numeric");
    }
    if (cfg.isDigitGame) {
      if (main.some(n => n < 0 || n > 9)) {
        reasons.push("main_numbers_out_of_range");
      }
    } else {
      if (new Set(main).size !== main.length) {
        reasons.push("main_numbers_duplicate");
      }
      if (main.some(n => n < 1 || n > cfg.mainMax)) {
        reasons.push("main_numbers_out_of_range");
      }
    }

    if (cfg.specialCount === 0) {
      if (special.length !== 0) {
        reasons.push("special_numbers_unexpected");
      }
    } else {
      if (special.length !== cfg.specialCount) {
        reasons.push("special_number_count_mismatch");
      }
      if (!special.every(n => Number.isFinite(n))) {
        reasons.push("special_numbers_non_numeric");
      }
      if (new Set(special).size !== special.length) {
        reasons.push("special_numbers_duplicate");
      }
      if (special.some(n => n < 1 || n > cfg.specialMax)) {
        reasons.push("special_numbers_out_of_range");
      }
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

function validatePdfExtraction(draws: OpenAiPdfDraw[]): PdfValidationResult {
  const reasons: string[] = [];
  if (!Array.isArray(draws)) {
    reasons.push("draws_not_array");
    return { valid: false, reasons };
  }

  if (draws.length === 0) {
    reasons.push("draws_empty");
    return { valid: false, reasons };
  }

  draws.forEach((draw, idx) => {
    const prefix = `draw_${idx}`;
    const gameType = parseGameType(draw.gameType);
    if (!gameType) {
      reasons.push(`${prefix}_missing_or_invalid_game_type`);
      return;
    }

    const cfg = FLORIDA_GAMES[gameType];
    if (!isValidIsoDate(draw.drawDate)) {
      reasons.push(`${prefix}_missing_or_invalid_draw_date`);
    }
    if (draw.drawTime !== "midday" && draw.drawTime !== "evening") {
      reasons.push(`${prefix}_missing_or_invalid_draw_time`);
    }

    const main = draw.mainNumbers || [];
    const special = draw.specialNumbers || [];
    if (main.length !== cfg.mainCount) {
      reasons.push(`${prefix}_main_number_count_mismatch`);
    }
    if (!main.every(n => Number.isFinite(n))) {
      reasons.push(`${prefix}_main_numbers_non_numeric`);
    }
    if (cfg.isDigitGame) {
      if (main.some(n => n < 0 || n > 9)) {
        reasons.push(`${prefix}_main_numbers_out_of_range`);
      }
    } else {
      if (new Set(main).size !== main.length) {
        reasons.push(`${prefix}_main_numbers_duplicate`);
      }
      if (main.some(n => n < 1 || n > cfg.mainMax)) {
        reasons.push(`${prefix}_main_numbers_out_of_range`);
      }
    }

    if (cfg.specialCount === 0) {
      if (special.length !== 0) {
        reasons.push(`${prefix}_special_numbers_unexpected`);
      }
    } else {
      if (special.length !== cfg.specialCount) {
        reasons.push(`${prefix}_special_number_count_mismatch`);
      }
      if (!special.every(n => Number.isFinite(n))) {
        reasons.push(`${prefix}_special_numbers_non_numeric`);
      }
      if (new Set(special).size !== special.length) {
        reasons.push(`${prefix}_special_numbers_duplicate`);
      }
      if (special.some(n => n < 1 || n > cfg.specialMax)) {
        reasons.push(`${prefix}_special_numbers_out_of_range`);
      }
    }
  });

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

function extractOutputText(response: unknown): string {
  const chunks: string[] = [];
  const output = (response as any)?.output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
      if (part?.type === "text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function sanitizePreview(value: unknown, limit = 220): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function parseJsonFromModelText(text: string): Record<string, unknown> {
  const candidates: string[] = [];
  const trimmed = text.trim();
  if (trimmed) candidates.push(trimmed);

  const fencedBlockMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fencedBlockMatch?.[1]) {
    candidates.push(fencedBlockMatch[1].trim());
  }

  const firstObjStart = trimmed.indexOf("{");
  const lastObjEnd = trimmed.lastIndexOf("}");
  if (firstObjStart >= 0 && lastObjEnd > firstObjStart) {
    candidates.push(trimmed.slice(firstObjStart, lastObjEnd + 1).trim());
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI OCR output did not contain a valid JSON object");
}

function normalizeDrawTime(raw: unknown): "midday" | "evening" {
  const value = String(raw || "").toLowerCase();
  return value === "midday" ? "midday" : "evening";
}

function normalizeNumberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => Number(v)).filter(Number.isFinite);
}

async function runTicketExtractionRequest(
  client: OpenAI,
  model: string,
  params: { imageUrl: string; gameTypeListHint: string }
): Promise<OpenAiTicketExtraction> {
  logOcrEvent("ticket_request", {
    endpoint: "responses.create",
    strategy: model === PRIMARY_OCR_MODEL ? "primary" : "fallback",
  }, model);
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              `Extract Florida Lottery ticket data from image.\n` +
              `Return strict JSON only with keys: gameType, drawDate, drawTime, mainNumbers, specialNumbers.\n` +
              `drawDate format: YYYY-MM-DD.\n` +
              `drawTime must be \"midday\" or \"evening\".\n` +
              `Available games:\n${params.gameTypeListHint}`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: params.imageUrl,
            detail: "high",
          },
          {
            type: "input_text",
            text:
              "Return only JSON object: " +
              "{\"gameType\":\"...\",\"drawDate\":\"YYYY-MM-DD\",\"drawTime\":\"midday|evening\",\"mainNumbers\":[...],\"specialNumbers\":[...]}",
          },
        ],
      },
    ],
    temperature: 0,
    max_output_tokens: 500,
  });
  const text = extractOutputText(response);
  logOcrEvent("ticket_response", {
    responseId: (response as any)?.id ?? null,
    outputTextPreview: sanitizePreview(text),
    strategy: model === PRIMARY_OCR_MODEL ? "primary" : "fallback",
  }, model);
  if (!text) {
    throw new Error("OpenAI OCR returned empty output for ticket extraction");
  }
  const parsed = parseJsonFromModelText(text);
  return {
    gameType: String(parsed.gameType || ""),
    drawDate: String(parsed.drawDate || ""),
    drawTime: normalizeDrawTime(parsed.drawTime),
    mainNumbers: normalizeNumberList(parsed.mainNumbers),
    specialNumbers: normalizeNumberList(parsed.specialNumbers),
  };
}

async function runPdfExtractionRequest(
  client: OpenAI,
  model: string,
  params: { pdfUrl: string; gameHint: string; gameTypeListHint: string }
): Promise<OpenAiPdfDraw[]> {
  logOcrEvent("pdf_request", {
    endpoint: "responses.create",
    strategy: model === PRIMARY_OCR_MODEL ? "primary" : "fallback",
  }, model);
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              `Extract ALL draw entries from this Florida Lottery PDF.\n` +
              `Return strict JSON only: {"draws":[{"gameType":"...","drawDate":"YYYY-MM-DD","drawTime":"midday|evening","mainNumbers":[...],"specialNumbers":[...]}]}.\n` +
              `Available games:\n${params.gameTypeListHint}\n` +
              `${params.gameHint}`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `PDF URL: ${params.pdfUrl}`,
          },
        ],
      },
    ],
    temperature: 0,
    max_output_tokens: 3000,
  });
  const text = extractOutputText(response);
  logOcrEvent("pdf_response", {
    responseId: (response as any)?.id ?? null,
    outputTextPreview: sanitizePreview(text),
    strategy: model === PRIMARY_OCR_MODEL ? "primary" : "fallback",
  }, model);
  if (!text) {
    throw new Error("OpenAI OCR returned empty output for PDF extraction");
  }
  const parsed = parseJsonFromModelText(text);
  const draws = Array.isArray(parsed.draws) ? parsed.draws : [];
  return draws.map((draw: any) => ({
    gameType: String(draw?.gameType || ""),
    drawDate: String(draw?.drawDate || ""),
    drawTime: normalizeDrawTime(draw?.drawTime),
    mainNumbers: normalizeNumberList(draw?.mainNumbers),
    specialNumbers: normalizeNumberList(draw?.specialNumbers),
  }));
}

export async function extractTicketFromImageWithOpenAI(params: {
  imageUrl: string;
  gameTypeListHint: string;
}): Promise<OpenAiTicketExtraction> {
  logOcrEvent("ticket_start", {
    imageUrlPreview: sanitizePreview(params.imageUrl, 140),
  });

  try {
    const client = getOpenAiClient();
    let primaryResult: OpenAiTicketExtraction | null = null;
    let primaryValidation: TicketValidationResult | null = null;
    let primaryError: Error | null = null;
    try {
      primaryResult = await runTicketExtractionRequest(client, PRIMARY_OCR_MODEL, params);
      primaryValidation = validateTicketExtraction(primaryResult);
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }

    if (primaryError && FALLBACK_OCR_MODEL !== PRIMARY_OCR_MODEL) {
      logOcrEvent("ticket_validation_failed", {
        reasons: ["primary_request_or_parse_failed"],
        fallbackModel: FALLBACK_OCR_MODEL,
        message: primaryError.message,
      }, PRIMARY_OCR_MODEL);
      logOcrEvent("ticket_fallback_start", {
        reasons: ["primary_request_or_parse_failed"],
        fromModel: PRIMARY_OCR_MODEL,
        toModel: FALLBACK_OCR_MODEL,
      }, FALLBACK_OCR_MODEL);
      try {
        const fallbackResult = await runTicketExtractionRequest(client, FALLBACK_OCR_MODEL, params);
        const fallbackValidation = validateTicketExtraction(fallbackResult);
        if (!fallbackValidation.valid) {
          throw new Error(
            `Fallback OCR output failed validation: ${fallbackValidation.reasons.join(", ")}`
          );
        }
        logOcrEvent("ticket_fallback_success", {
          fallbackUsed: true,
          reason: "primary_request_or_parse_failed",
        }, FALLBACK_OCR_MODEL);
        return fallbackResult;
      } catch (fallbackError) {
        logOcrEvent("ticket_fallback_failure", {
          message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          fromModel: PRIMARY_OCR_MODEL,
          toModel: FALLBACK_OCR_MODEL,
        }, FALLBACK_OCR_MODEL);
        throw fallbackError;
      }
    }

    if (primaryError) {
      throw primaryError;
    }

    const primaryResultSafe = primaryResult as OpenAiTicketExtraction;
    const primaryValidationSafe = primaryValidation as TicketValidationResult;
    if (primaryValidationSafe.valid || FALLBACK_OCR_MODEL === PRIMARY_OCR_MODEL) {
      logOcrEvent("ticket_fallback_success", {
        fallbackUsed: false,
        reason: primaryValidationSafe.valid ? "primary_valid" : "fallback_disabled_same_model",
      }, PRIMARY_OCR_MODEL);
      return primaryResultSafe;
    }

    logOcrEvent("ticket_validation_failed", {
      reasons: primaryValidationSafe.reasons,
      fallbackModel: FALLBACK_OCR_MODEL,
    }, PRIMARY_OCR_MODEL);
    logOcrEvent("ticket_fallback_start", {
      reasons: primaryValidationSafe.reasons,
      fromModel: PRIMARY_OCR_MODEL,
      toModel: FALLBACK_OCR_MODEL,
    }, FALLBACK_OCR_MODEL);

    try {
      const fallbackResult = await runTicketExtractionRequest(client, FALLBACK_OCR_MODEL, params);
      const fallbackValidation = validateTicketExtraction(fallbackResult);
      if (!fallbackValidation.valid) {
        throw new Error(
          `Fallback OCR output failed validation: ${fallbackValidation.reasons.join(", ")}`
        );
      }
      logOcrEvent("ticket_fallback_success", {
        fallbackUsed: true,
        reason: primaryValidationSafe.reasons.join(","),
      }, FALLBACK_OCR_MODEL);
      return fallbackResult;
    } catch (fallbackError) {
      logOcrEvent("ticket_fallback_failure", {
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        fromModel: PRIMARY_OCR_MODEL,
        toModel: FALLBACK_OCR_MODEL,
      }, FALLBACK_OCR_MODEL);
      throw fallbackError;
    }
  } catch (error) {
    logOcrEvent("ticket_failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function extractPdfDrawsWithOpenAI(params: {
  pdfUrl: string;
  gameHint: string;
  gameTypeListHint: string;
}): Promise<OpenAiPdfDraw[]> {
  logOcrEvent("pdf_start", {
    pdfUrlPreview: sanitizePreview(params.pdfUrl, 140),
  });

  try {
    const client = getOpenAiClient();
    let primaryResult: OpenAiPdfDraw[] | null = null;
    let primaryValidation: PdfValidationResult | null = null;
    let primaryError: Error | null = null;
    try {
      primaryResult = await runPdfExtractionRequest(client, PRIMARY_OCR_MODEL, params);
      primaryValidation = validatePdfExtraction(primaryResult);
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }

    if (primaryError && FALLBACK_OCR_MODEL !== PRIMARY_OCR_MODEL) {
      logOcrEvent("pdf_validation_failed", {
        reasons: ["primary_request_or_parse_failed"],
        fallbackModel: FALLBACK_OCR_MODEL,
        message: primaryError.message,
      }, PRIMARY_OCR_MODEL);
      logOcrEvent("pdf_fallback_start", {
        reasons: ["primary_request_or_parse_failed"],
        fromModel: PRIMARY_OCR_MODEL,
        toModel: FALLBACK_OCR_MODEL,
      }, FALLBACK_OCR_MODEL);
      try {
        const fallbackResult = await runPdfExtractionRequest(client, FALLBACK_OCR_MODEL, params);
        const fallbackValidation = validatePdfExtraction(fallbackResult);
        if (!fallbackValidation.valid) {
          throw new Error(
            `Fallback OCR PDF output failed validation: ${fallbackValidation.reasons.join(", ")}`
          );
        }
        logOcrEvent("pdf_fallback_success", {
          fallbackUsed: true,
          reason: "primary_request_or_parse_failed",
        }, FALLBACK_OCR_MODEL);
        return fallbackResult;
      } catch (fallbackError) {
        logOcrEvent("pdf_fallback_failure", {
          message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          fromModel: PRIMARY_OCR_MODEL,
          toModel: FALLBACK_OCR_MODEL,
        }, FALLBACK_OCR_MODEL);
        throw fallbackError;
      }
    }

    if (primaryError) {
      throw primaryError;
    }

    const primaryResultSafe = primaryResult as OpenAiPdfDraw[];
    const primaryValidationSafe = primaryValidation as PdfValidationResult;
    if (primaryValidationSafe.valid || FALLBACK_OCR_MODEL === PRIMARY_OCR_MODEL) {
      logOcrEvent("pdf_fallback_success", {
        fallbackUsed: false,
        reason: primaryValidationSafe.valid ? "primary_valid" : "fallback_disabled_same_model",
      }, PRIMARY_OCR_MODEL);
      return primaryResultSafe;
    }

    logOcrEvent("pdf_validation_failed", {
      reasons: primaryValidationSafe.reasons,
      fallbackModel: FALLBACK_OCR_MODEL,
    }, PRIMARY_OCR_MODEL);
    logOcrEvent("pdf_fallback_start", {
      reasons: primaryValidationSafe.reasons,
      fromModel: PRIMARY_OCR_MODEL,
      toModel: FALLBACK_OCR_MODEL,
    }, FALLBACK_OCR_MODEL);

    try {
      const fallbackResult = await runPdfExtractionRequest(client, FALLBACK_OCR_MODEL, params);
      const fallbackValidation = validatePdfExtraction(fallbackResult);
      if (!fallbackValidation.valid) {
        throw new Error(
          `Fallback OCR PDF output failed validation: ${fallbackValidation.reasons.join(", ")}`
        );
      }
      logOcrEvent("pdf_fallback_success", {
        fallbackUsed: true,
        reason: primaryValidationSafe.reasons.join(","),
      }, FALLBACK_OCR_MODEL);
      return fallbackResult;
    } catch (fallbackError) {
      logOcrEvent("pdf_fallback_failure", {
        message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        fromModel: PRIMARY_OCR_MODEL,
        toModel: FALLBACK_OCR_MODEL,
      }, FALLBACK_OCR_MODEL);
      throw fallbackError;
    }
  } catch (error) {
    logOcrEvent("pdf_failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
