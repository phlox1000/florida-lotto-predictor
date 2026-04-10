import type { GameConfig } from "../../shared/lottery";
import type { HistoryDraw } from "./types";
import { range, counter, deterministicWeightedSelect } from "./helpers";

/**
 * Generate special numbers (Powerball, Mega Ball, etc.) from historical frequency.
 * Falls back to frequency-uniform selection if no history available.
 */
export function generateSpecialFromHistory(cfg: GameConfig, history: HistoryDraw[], salt: number = 0): number[] {
  if (cfg.specialCount === 0) return [];
  const pool = range(1, cfg.specialMax);
  if (history.length === 0) {
    const weights = pool.map(() => 1);
    return deterministicWeightedSelect(pool, weights, cfg.specialCount, salt).sort((a, b) => a - b);
  }
  const allSpecial = history.flatMap(d => d.specialNumbers);
  const freq = counter(allSpecial);
  const weights = pool.map(n => (freq.get(n) || 0.5));
  return deterministicWeightedSelect(pool, weights, cfg.specialCount, salt).sort((a, b) => a - b);
}
