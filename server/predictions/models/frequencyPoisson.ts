import type { GameConfig, PredictionResult } from "../../../shared/lottery";
import type { HistoryDraw } from "../types";
import { range, counter, deterministicWeightedSelect, checkHistory, insufficientDataResult } from "../helpers";
import { generateSpecialFromHistory } from "../specialNumbers";

/**
 * Model 1: Frequency Baseline
 * Uses uniform frequency analysis from ALL history.
 * When no history exists, uses a deterministic spread algorithm.
 */
export function frequencyBaselineModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const pool = cfg.isDigitGame ? range(0, 9) : range(1, cfg.mainMax);

  if (history.length === 0) {
    // Fixed spread: evenly space numbers across the pool. No wall-clock dependency.
    const step = Math.max(1, Math.floor(pool.length / cfg.mainCount));
    const main: number[] = [];
    for (let i = 0; i < cfg.mainCount && i * step < pool.length; i++) {
      main.push(pool[i * step]);
    }
    while (main.length < cfg.mainCount) {
      main.push(pool[main.length]);
    }
    return {
      modelName: "frequency_baseline",
      mainNumbers: cfg.isDigitGame ? main : main.sort((a, b) => a - b),
      specialNumbers: generateSpecialFromHistory(cfg, history, 1),
      confidenceScore: 0.1,
      metadata: { strategy: "deterministic_spread", message: "No history available. Using evenly-spaced numbers." },
    };
  }

  const allNums = history.flatMap(d => d.mainNumbers);
  const freq = counter(allNums);
  const weights = pool.map(n => (freq.get(n) || 0.1));
  const main = deterministicWeightedSelect(pool, weights, cfg.mainCount, 1);

  return {
    modelName: "frequency_baseline",
    mainNumbers: cfg.isDigitGame ? main : main.sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 1),
    confidenceScore: Math.min(0.5, 0.1 + history.length * 0.005),
    metadata: { strategy: "full_frequency_analysis", historyUsed: history.length },
  };
}

/**
 * Models 2-4: Poisson Distribution (Standard/Short/Long lookback)
 * Uses Poisson probability: P(x) = 1 - e^(-lambda) where lambda = observed_freq / draws
 */
export function poissonModel(cfg: GameConfig, history: HistoryDraw[], lookback: number, name: string): PredictionResult {
  const check = checkHistory(history, 10, cfg);
  if (!check.sufficient) return insufficientDataResult(name, cfg, check);

  const recent = history.slice(-lookback);
  const total = recent.length;
  const allNums = recent.flatMap(d => d.mainNumbers);
  const obs = counter(allNums);
  const pool = range(1, cfg.mainMax);
  const probs = new Map<number, number>();
  for (const n of pool) {
    probs.set(n, 1 - Math.exp(-(obs.get(n) || 0) / total));
  }
  const sorted = [...pool].sort((a, b) => (probs.get(b) || 0) - (probs.get(a) || 0));
  const main = sorted.slice(0, cfg.mainCount).sort((a, b) => a - b);
  const avgProb = main.reduce((s, n) => s + (probs.get(n) || 0), 0) / main.length;

  return {
    modelName: name,
    mainNumbers: main,
    specialNumbers: generateSpecialFromHistory(cfg, history, lookback),
    confidenceScore: Math.min(0.95, avgProb),
    metadata: { strategy: "poisson", lookback, drawsUsed: total },
  };
}
