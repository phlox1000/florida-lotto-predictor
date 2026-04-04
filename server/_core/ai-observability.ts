export type AiObservabilityFeature =
  | "analysis.generate"
  | "upload-ticket-ocr"
  | "upload-pdf-ocr";

export type AiObservabilityRecord = {
  feature: AiObservabilityFeature;
  providerAttempted: string;
  providerSucceeded: boolean;
  fallbackUsed: boolean;
  timestamp: string;
  errorCode: string | null;
  errorMessage: string | null;
  detail?: Record<string, unknown>;
};

const aiObservabilityLog: AiObservabilityRecord[] = [];
const AI_OBSERVABILITY_LOG_LIMIT = 120;

export function safeShortErrorCode(input: unknown): string {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!raw) return "unknown_error";
  return raw.slice(0, 64);
}

export function recordAiObservability(record: AiObservabilityRecord): void {
  aiObservabilityLog.push(record);
  if (aiObservabilityLog.length > AI_OBSERVABILITY_LOG_LIMIT) {
    aiObservabilityLog.splice(0, aiObservabilityLog.length - AI_OBSERVABILITY_LOG_LIMIT);
  }
}

export function getRecentAiObservability(limit = 40): AiObservabilityRecord[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(200, Math.floor(limit)))
    : 40;
  return aiObservabilityLog.slice(-safeLimit);
}

