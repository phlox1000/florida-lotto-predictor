import OpenAI from "openai";
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
    | "ticket_failure"
    | "pdf_start"
    | "pdf_request"
    | "pdf_response"
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
  detail: Record<string, unknown>
) {
  const payload = {
    stage,
    timestamp: new Date().toISOString(),
    model: ENV.openAiModel,
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

function normalizeDrawTime(raw: unknown): "midday" | "evening" {
  const value = String(raw || "").toLowerCase();
  return value === "midday" ? "midday" : "evening";
}

function normalizeNumberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => Number(v)).filter(Number.isFinite);
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
    logOcrEvent("ticket_request", {
      endpoint: "responses.create",
    });
    const response = await client.responses.create({
      model: ENV.openAiModel,
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
    });
    if (!text) {
      throw new Error("OpenAI OCR returned empty output for ticket extraction");
    }

    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      gameType: String(parsed.gameType || ""),
      drawDate: String(parsed.drawDate || ""),
      drawTime: normalizeDrawTime(parsed.drawTime),
      mainNumbers: normalizeNumberList(parsed.mainNumbers),
      specialNumbers: normalizeNumberList(parsed.specialNumbers),
    };
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
    logOcrEvent("pdf_request", {
      endpoint: "responses.create",
    });
    const response = await client.responses.create({
      model: ENV.openAiModel,
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
    });
    if (!text) {
      throw new Error("OpenAI OCR returned empty output for PDF extraction");
    }

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const draws = Array.isArray(parsed.draws) ? parsed.draws : [];
    return draws.map((draw: any) => ({
      gameType: String(draw?.gameType || ""),
      drawDate: String(draw?.drawDate || ""),
      drawTime: normalizeDrawTime(draw?.drawTime),
      mainNumbers: normalizeNumberList(draw?.mainNumbers),
      specialNumbers: normalizeNumberList(draw?.specialNumbers),
    }));
  } catch (error) {
    logOcrEvent("pdf_failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
