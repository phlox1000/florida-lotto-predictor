import type { GameConfig, PredictionResult } from "../../shared/lottery";
import type { DataCheck, HistoryDraw } from "./types";

/**
 * Simple integer hash for mixing numeric inputs into a well-distributed value.
 * Uses the 32-bit FNV-1a-inspired mixing constants from the original codebase.
 */
function mixHash(a: number, b: number): number {
  let h = a * 2654435761 + b * 40503;
  h = ((h << 13) ^ h) | 0;
  h = (h * 1597334677) | 0;
  return h;
}

/**
 * Derive a stable hash from history for use as a base seed.
 * Uses the last few draws so the seed changes when data changes,
 * but stays constant for identical input regardless of wall-clock time.
 */
export function historyHash(history: HistoryDraw[]): number {
  let h = history.length * 2654435761;
  const tail = history.slice(-5);
  for (const draw of tail) {
    for (const n of draw.mainNumbers) {
      h = ((h << 5) - h + n) | 0;
    }
    h = ((h << 5) - h + (draw.drawDate || 0)) | 0;
  }
  return h;
}

/** Weighted sampling WITHOUT replacement from a scored pool.
 *  Selection is driven by weights + a stable seed derived from salt and item state. */
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
    const seed = stableSeed(result, pick);
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
 * Stable pseudo-random seed based on current picks and iteration.
 * Derived entirely from input state — no wall-clock dependency.
 * Returns a value between 0 and 1.
 */
export function stableSeed(currentPicks: number[], iteration: number): number {
  let hash = iteration * 2654435761;
  for (const n of currentPicks) {
    hash = ((hash << 5) - hash + n) | 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

/** Deterministic selection from a scored pool — picks top items by weight.
 *  Uses a small salt-based perturbation for stable tie-breaking (no wall-clock). */
export function deterministicWeightedSelect(
  items: number[],
  weights: number[],
  k: number,
  salt: number = 0
): number[] {
  const pairs = items.map((item, i) => ({ item, weight: weights[i] }));
  for (let i = 0; i < pairs.length; i++) {
    const tieBreaker = Math.abs(mixHash(salt, pairs[i].item) % 10000) / 100000;
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
