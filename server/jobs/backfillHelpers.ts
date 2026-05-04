/**
 * Shared helpers for the accuracy event backfill scripts.
 *
 * Used by:
 *  - server/jobs/previewAccuracyEventBackfill.ts (read-only preview)
 *  - server/jobs/backfillAccuracyEvents.ts (write-capable backfill)
 *
 * Pure functions only — no DB access, no I/O. Testable in isolation.
 */

import { scorePredictionAgainstDraw } from "../predictions/scorePrediction";

/**
 * The matching window the live path uses to pair predictions with draws.
 * Mirrors the `sevenDaysAgo` cutoff in server/db.ts evaluatePredictionsAgainstDraw.
 */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface PredictionLite {
  id: number;
  userId: number;
  modelName: string;
  gameType: string;
  mainNumbers: number[];
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DrawLite {
  id: number;
  drawDate: number;
  mainNumbers: number[];
}

/**
 * Find draws within the matching window after a prediction was made.
 *
 * Returns all draws d where d.drawDate is in (predictionTime, predictionTime + windowMs].
 * Draws are NOT pre-filtered by gameType — caller must pass only draws for the same game.
 *
 * Mirrors the live evaluatePredictionsAgainstDraw matching logic exactly.
 */
export function findCandidateDraws(
  prediction: { createdAt: Date },
  drawsForGame: DrawLite[],
  windowMs: number = SEVEN_DAYS_MS,
): DrawLite[] {
  const predTimeMs = prediction.createdAt.getTime();
  const cutoffMs = predTimeMs + windowMs;
  return drawsForGame.filter(
    (d) => d.drawDate > predTimeMs && d.drawDate <= cutoffMs,
  );
}

/**
 * Extract the explainable factor_snapshot from a prediction's metadata.
 * Returns {} if the field is missing, null, or the metadata itself is null.
 *
 * Matches the read pattern at server/db.ts:706 in evaluatePredictionsAgainstDraw.
 */
export function extractFactorSnapshot(
  metadata: Record<string, unknown> | null,
): Record<string, number> {
  return ((metadata as any)?.explainable?.factorSnapshot ?? {}) as Record<string, number>;
}

export interface BackfillEventRow {
  id: string;
  event_type: "prediction_accuracy_calculated";
  app_id: string;
  user_id: number;
  correlation_id: string;
  occurred_at: Date;
  schema_version: string;
  platform_version: string;
  payload: {
    game: string;
    matched_numbers: number;
    total_picks: number;
    net_outcome: number;
    model_scores: Record<string, number>;
    factor_snapshot: Record<string, number>;
    match_ratio: number;
    triggered_by: string;
    source: "historical_backfill_phase1";
    backfill_run_id: string;
    prediction_id: number;
    draw_result_id: number;
  };
}

/**
 * Build a synthetic prediction_accuracy_calculated event row for a (prediction, draw) pair.
 *
 * Properties:
 *  - Deterministic id (`backfill:accuracy:<game>:<predId>:<drawId>`) — re-runs collide on
 *    primary key, making the operation idempotent.
 *  - occurred_at = the historical draw date (NOT insertion time). The rebuild filters by
 *    occurred_at, so this controls which rolling window the event falls into.
 *  - correlation_id reconstructed in the same format the live path uses.
 *  - Payload mirrors the live emit shape exactly, plus four backfill-only fields the
 *    rebuild's aggregation ignores (queryable for audit / rollback).
 */
export function buildBackfillEventRow(args: {
  prediction: PredictionLite;
  draw: DrawLite;
  backfillRunId: string;
  appId?: string;
  schemaVersion?: string;
  platformVersion?: string;
}): BackfillEventRow {
  const { prediction, draw, backfillRunId } = args;
  const { mainHits, matchRatio } = scorePredictionAgainstDraw(
    prediction.mainNumbers,
    draw.mainNumbers,
  );
  const factorSnapshot = extractFactorSnapshot(prediction.metadata);
  const correlation_id = `prediction:${prediction.gameType}:${prediction.userId}:${prediction.createdAt.getTime()}`;
  const id = `backfill:accuracy:${prediction.gameType}:${prediction.id}:${draw.id}`;

  return {
    id,
    event_type: "prediction_accuracy_calculated",
    app_id: args.appId ?? "florida-lotto",
    user_id: prediction.userId,
    correlation_id,
    occurred_at: new Date(draw.drawDate),
    schema_version: args.schemaVersion ?? "1.0",
    platform_version: args.platformVersion ?? "1.0.0",
    payload: {
      game: prediction.gameType,
      matched_numbers: mainHits,
      total_picks: prediction.mainNumbers.length,
      net_outcome: 0,
      model_scores: { [prediction.modelName]: matchRatio },
      factor_snapshot: factorSnapshot,
      match_ratio: matchRatio,
      triggered_by: correlation_id,
      source: "historical_backfill_phase1",
      backfill_run_id: backfillRunId,
      prediction_id: prediction.id,
      draw_result_id: draw.id,
    },
  };
}
