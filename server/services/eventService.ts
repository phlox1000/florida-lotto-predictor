import { getDb } from "../db";
import { appEvents, type InsertAppEvent } from "../db/schema/appEvents";
import { matchRatioFromCounts } from "../predictions/scorePrediction";

export function buildPredictionCorrelationId(userId: number, game: string, timestamp: number): string {
  return `prediction:${game}:${userId}:${timestamp}`;
}

export function buildDrawCorrelationId(game: string, drawDate: string): string {
  return `draw:${game}:${drawDate}`;
}

export async function emitPredictionGenerated(input: {
  userId: number;
  game: string;
  correlationId: string;
  modelWeights: Record<string, number>;
  picks: number[][];
  confidenceScore: number;
  platformVersion: string;
  schemaVersion: string;
  occurredAt: Date;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const event: InsertAppEvent = {
      event_type: "prediction_generated",
      app_id: "florida-lotto",
      user_id: input.userId,
      correlation_id: input.correlationId,
      occurred_at: input.occurredAt,
      schema_version: input.schemaVersion,
      platform_version: input.platformVersion,
      payload: {
        game: input.game,
        model_weights: input.modelWeights,
        picks: input.picks,
        confidence_score: input.confidenceScore,
      },
    };

    await db.insert(appEvents).values(event);
  } catch (err) {
    console.error("[eventService] Failed to emit prediction_generated event:", err);
  }
}

export async function emitPredictionActedOn(input: {
  userId: number;
  correlationId: string;
  action: "purchased" | "rejected" | "modified";
  ticketCost: number;
  modifiedPicks?: number[][];
  occurredAt: Date;
  platformVersion: string;
  schemaVersion: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const payload: Record<string, unknown> = {
      action: input.action,
      ticket_cost: input.ticketCost,
    };
    if (input.modifiedPicks !== undefined) {
      payload.modified_picks = input.modifiedPicks;
    }

    const event: InsertAppEvent = {
      event_type: "prediction_acted_on",
      app_id: "florida-lotto",
      user_id: input.userId,
      correlation_id: input.correlationId,
      occurred_at: input.occurredAt,
      schema_version: input.schemaVersion,
      platform_version: input.platformVersion,
      payload,
    };

    await db.insert(appEvents).values(event);
  } catch (err) {
    console.error("[eventService] Failed to emit prediction_acted_on event:", err);
  }
}

export async function emitPredictionAccuracyCalculated(input: {
  userId: number;
  correlationId: string;
  triggeredBy: string;
  matchedNumbers: number;
  totalPicks: number;
  netOutcome: number;
  modelScores: Record<string, number>;
  factorSnapshot?: Record<string, number>;
  matchRatio?: number;
  game?: string;
  occurredAt: Date;
  platformVersion: string;
  schemaVersion: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const event: InsertAppEvent = {
      event_type: "prediction_accuracy_calculated",
      app_id: "florida-lotto",
      user_id: input.userId,
      correlation_id: input.correlationId,
      occurred_at: input.occurredAt,
      schema_version: input.schemaVersion,
      platform_version: input.platformVersion,
      payload: {
        matched_numbers: input.matchedNumbers,
        total_picks: input.totalPicks,
        net_outcome: input.netOutcome,
        model_scores: input.modelScores,
        triggered_by: input.triggeredBy,
        factor_snapshot: input.factorSnapshot ?? {},
        match_ratio: typeof input.matchRatio === "number"
          ? input.matchRatio
          : matchRatioFromCounts(input.matchedNumbers, input.totalPicks),
        game: input.game ?? null,
      },
    };

    await db.insert(appEvents).values(event);
  } catch (err) {
    console.error("[eventService] Failed to emit prediction_accuracy_calculated event:", err);
  }
}

export async function emitDrawResultEntered(input: {
  userId: number | null;
  game: string;
  drawDate: string;
  winningNumbers: number[];
  occurredAt: Date;
  platformVersion: string;
  schemaVersion: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const event: InsertAppEvent = {
      event_type: "draw_result_entered",
      app_id: "florida-lotto",
      user_id: input.userId,
      correlation_id: buildDrawCorrelationId(input.game, input.drawDate),
      occurred_at: input.occurredAt,
      schema_version: input.schemaVersion,
      platform_version: input.platformVersion,
      payload: {
        game: input.game,
        winning_numbers: input.winningNumbers,
        draw_date: input.drawDate,
      },
    };

    await db.insert(appEvents).values(event);
  } catch (err) {
    console.error("[eventService] Failed to emit draw_result_entered event:", err);
  }
}
