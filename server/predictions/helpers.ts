import type { GameConfig, PredictionResult } from "../../shared/lottery";
import type { DataCheck, HistoryDraw } from "./types";

/** Weighted sampling WITHOUT replacement from a scored pool. No pure randomness. */
export function weightedSampleWithoutReplacement(
  items: number[],
  weights: number[],
  k: number
): number[] {
  const result: number[] = [];
  const usedIdx = new Set<number>();
  for (let pick = 0; pick < k; pick++) {
    let totalW = 0;
    for (let j = 0; j < items.length; j++) {
      if (!usedIdx.has(j)) totalW += weights[j];
    }
    if (totalW <= 0) break;
    const seed = deterministicSeed(result, pick);
    let threshold = seed * totalW;
    for (let j = 0; j < items.length; j++) {
      if (usedIdx.has(j)) continue;
      threshold -= weights[j];
      if (threshold <= 0) {
        result.push(items[j]);
        usedIdx.add(j);
        break;
      }
    }
  }
  return result;
}

/**
 * Deterministic pseudo-random seed based on current state.
 * Uses a hash of the current timestamp (minute-level granularity for consistency
 * within a prediction run) and the numbers already picked.
 * Returns a value between 0 and 1.
 */
export function deterministicSeed(currentPicks: number[], iteration: number): number {
  const timeComponent = Math.floor(Date.now() / 60000);
  let hash = timeComponent * 2654435761 + iteration * 40503;
  for (const n of currentPicks) {
    hash = ((hash << 5) - hash + n) | 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

/** Deterministic selection from a scored pool — picks top items by weight with slight variation. */
export function deterministicWeightedSelect(
  items: number[],
  weights: number[],
  k: number,
  salt: number = 0
): number[] {
  const pairs = items.map((item, i) => ({ item, weight: weights[i] }));
  const timeComponent = Math.floor(Date.now() / 60000);
  for (let i = 0; i < pairs.length; i++) {
    const tieBreaker = Math.abs(((timeComponent + salt) * 2654435761 + pairs[i].item * 40503) % 10000) / 100000;
    pairs[i].weight += tieBreaker;
  }
  pairs.sort((a, b) => b.weight - a.weight);
  return pairs.slice(0, k).map(p => p.item);
}

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function counter(nums: number[]): Map<number, number> {
  const c = new Map<number, number>();
  for (const n of nums) c.set(n, (c.get(n) || 0) + 1);
  return c;
}

export function checkHistory(history: HistoryDraw[], required: number, cfg: GameConfig): DataCheck {
  return {
    sufficient: history.length >= required && !cfg.isDigitGame,
    available: history.length,
    required,
  };
}

export function insufficientDataResult(modelName: string, cfg: GameConfig, dataCheck: DataCheck): PredictionResult {
  return {
    modelName,
    mainNumbers: [],
    specialNumbers: [],
    confidenceScore: 0,
    metadata: {
      strategy: "insufficient_data",
      message: `Needs at least ${dataCheck.required} historical draws (have ${dataCheck.available})${cfg.isDigitGame ? ". Digit games not supported by this model." : ""}`,
      insufficient_data: true,
    },
  };
}
