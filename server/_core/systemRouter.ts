import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getLiveTableList } from "../personalization-metrics";
import { ENV } from "./env";

/** In-memory store for the latest OCR confidence log (set by upload routes). */
let _lastOcrConfidence: {
  route: string;
  confidence: number;
  fieldsExpected: number;
  fieldsParsed: number;
  timestamp: string;
} | null = null;

export function setLastOcrConfidence(data: typeof _lastOcrConfidence) {
  _lastOcrConfidence = data;
}

export function getLastOcrConfidence() {
  return _lastOcrConfidence;
}

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /** Debug status endpoint: reports live table list, LLM config status, and last OCR confidence */
  debugStatus: publicProcedure.query(async () => {
    const tables = await getLiveTableList();
    const llmKeyConfigured = Boolean(
      ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0
    );
    const dbUrl = process.env.DATABASE_URL;
    return {
      liveTables: tables,
      personalizationMetricsExists: tables.includes("personalization_metrics"),
      llmKeyConfigured,
      databaseUrlConfigured: Boolean(dbUrl && dbUrl.trim().length > 0),
      databaseUrlPrefix: dbUrl ? dbUrl.slice(0, 20) + "..." : null,
      lastOcrConfidence: _lastOcrConfidence,
      timestamp: new Date().toISOString(),
    };
  }),
});
