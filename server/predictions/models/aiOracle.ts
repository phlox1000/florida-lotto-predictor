import type { GameConfig, PredictionResult } from "../../../shared/lottery";
import type { HistoryDraw } from "../types";
import { generateSpecialFromHistory } from "../specialNumbers";

/**
 * Model 16: AI Oracle (Meta-Ensemble)
 * Weighted vote from all sibling model outputs, using accuracy-based weights when available.
 * Only considers models that produced valid (non-empty) results.
 */
export function aiOracleModel(
  cfg: GameConfig,
  history: HistoryDraw[],
  siblingResults: PredictionResult[],
  modelWeights?: Record<string, number>
): PredictionResult {
  const validResults = siblingResults.filter(
    p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data
  );

  if (validResults.length === 0) {
    return {
      modelName: "ai_oracle",
      mainNumbers: [],
      specialNumbers: [],
      confidenceScore: 0,
      metadata: {
        strategy: "insufficient_data",
        message: "No sibling models produced valid results. Add more historical data.",
        insufficient_data: true,
      },
    };
  }

  const votes = new Map<number, number>();
  let confAccum = 0;
  for (const pred of validResults) {
    const accuracyWeight = modelWeights?.[pred.modelName] ?? 1.0;
    const w = pred.confidenceScore * accuracyWeight;
    for (const n of pred.mainNumbers) {
      votes.set(n, (votes.get(n) || 0) + w);
    }
    confAccum += w;
  }

  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const main = sorted.slice(0, cfg.mainCount).map(e => e[0]).sort((a, b) => a - b);

  return {
    modelName: "ai_oracle",
    mainNumbers: main,
    specialNumbers: generateSpecialFromHistory(cfg, history, 16),
    confidenceScore: Math.min(0.95, confAccum / Math.max(1, validResults.length)),
    metadata: {
      strategy: "adaptive_meta_ensemble",
      validModelCount: validResults.length,
      totalModels: siblingResults.length,
      insufficientModels: siblingResults.length - validResults.length,
    },
  };
}
