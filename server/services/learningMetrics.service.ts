import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { rebuildPredictionLearningMetricsFromEvents } from "../db";

/**
 * Cron-safe utility: rebuild learning metrics for one game or all active games.
 */
export async function refreshPredictionLearningMetrics(input?: {
  gameType?: GameType;
  windowDays?: number;
}) {
  if (input?.gameType) {
    return rebuildPredictionLearningMetricsFromEvents({
      gameType: input.gameType,
      windowDays: input.windowDays,
    });
  }

  let updated = 0;
  let factors = 0;
  let models = 0;
  for (const [gameType, cfg] of Object.entries(FLORIDA_GAMES)) {
    if (cfg.schedule.ended) continue;
    const result = await rebuildPredictionLearningMetricsFromEvents({
      gameType,
      windowDays: input?.windowDays,
    });
    updated += result.updated;
    factors += result.factors;
    models += result.models;
  }

  return { updated, factors, models };
}
