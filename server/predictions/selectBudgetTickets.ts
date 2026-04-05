import type { GameConfig, PredictionResult } from "../../shared/lottery";
import { deterministicWeightedSelect } from "./helpers";
import { generateSpecialFromHistory } from "./specialNumbers";

/**
 * Budget-aware ticket selector: picks exactly `ticketCount` tickets within `budget`.
 * Uses a multi-step filtering process combining all model outputs.
 * Only uses formula-based model outputs — never generates random tickets.
 */
export function selectBudgetTickets(
  cfg: GameConfig,
  allPredictions: PredictionResult[],
  budget: number = 75,
  maxTickets: number = 20,
): { tickets: Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }>; totalCost: number } {
  const ticketPrice = cfg.ticketPrice;
  const affordableCount = Math.min(maxTickets, Math.floor(budget / ticketPrice));

  const validPredictions = allPredictions.filter(
    p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data
  );

  const numberScores = new Map<number, number>();
  for (const pred of validPredictions) {
    for (const n of pred.mainNumbers) {
      numberScores.set(n, (numberScores.get(n) || 0) + pred.confidenceScore);
    }
  }

  const sorted = [...validPredictions].sort((a, b) => b.confidenceScore - a.confidenceScore);
  const tickets: Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }> = [];
  const usedKeys = new Set<string>();

  for (const pred of sorted) {
    if (tickets.length >= affordableCount) break;
    const key = pred.mainNumbers.join(",") + "|" + pred.specialNumbers.join(",");
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      tickets.push({
        mainNumbers: pred.mainNumbers,
        specialNumbers: pred.specialNumbers,
        modelSource: pred.modelName,
        confidence: pred.confidenceScore,
      });
    }
  }

  const topNums = [...numberScores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  if (topNums.length >= cfg.mainCount) {
    // For single-number games (Cash Pop), use the full scored pool so each
    // variation can pick a distinct number. For multi-number games, use 3x mainCount.
    const poolSize = cfg.mainCount === 1
      ? Math.min(topNums.length, cfg.mainMax)
      : Math.min(topNums.length, cfg.mainCount * 3);
    let variationSalt = 0;
    while (tickets.length < affordableCount && variationSalt < 200) {
      variationSalt++;
      const pool = topNums.slice(0, poolSize);
      const weights = pool.map(n => numberScores.get(n) || 0);
      const main = deterministicWeightedSelect(pool, weights, cfg.mainCount, variationSalt).sort((a, b) => a - b);
      const special = generateSpecialFromHistory(cfg, allPredictions.length > 0 ? [] : [], variationSalt);
      const key = main.join(",") + "|" + special.join(",");
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        tickets.push({
          mainNumbers: main,
          specialNumbers: special,
          modelSource: "ensemble_variation",
          confidence: 0.5,
        });
      }
    }
  }

  return {
    tickets: tickets.slice(0, affordableCount),
    totalCost: tickets.slice(0, affordableCount).length * ticketPrice,
  };
}
