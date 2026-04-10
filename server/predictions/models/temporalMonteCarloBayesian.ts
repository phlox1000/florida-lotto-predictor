import type { GameConfig, PredictionResult } from "../../../shared/lottery";
import type { HistoryDraw } from "../types";
import {
  range, counter, deterministicWeightedSelect,
  weightedSampleWithoutReplacement, checkHistory, insufficientDataResult,
} from "../helpers";
import { generateSpecialFromHistory } from "../specialNumbers";

/**
 * Model 11: Temporal Echo
 * Finds patterns from the same calendar date/month in previous years.
 */
export function temporalEchoModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length === 0) {
    return insufficientDataResult("temporal_echo", cfg, { sufficient: false, available: 0, required: 1 });
  }

  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  const echoPool: number[] = [];
  for (const draw of history) {
    const d = new Date(draw.drawDate);
    if (d.getMonth() === month && d.getDate() === day) {
      echoPool.push(...draw.mainNumbers);
    }
  }

  const monthPool: number[] = [];
  for (const draw of history) {
    const d = new Date(draw.drawDate);
    if (d.getMonth() === month) {
      monthPool.push(...draw.mainNumbers);
    }
  }

  const pool = echoPool.length >= cfg.mainCount ? echoPool : monthPool;
  if (pool.length < cfg.mainCount) {
    return insufficientDataResult("temporal_echo", cfg, {
      sufficient: false,
      available: pool.length,
      required: cfg.mainCount,
    });
  }

  const freq = counter(pool);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const main = sorted.slice(0, cfg.mainCount).map(e => e[0]).sort((a, b) => a - b);

  return {
    modelName: "temporal_echo",
    mainNumbers: main,
    specialNumbers: generateSpecialFromHistory(cfg, history, 11),
    confidenceScore: echoPool.length >= cfg.mainCount ? 0.65 : 0.45,
    metadata: {
      strategy: "seasonal_echo",
      exactDateMatches: echoPool.length,
      monthMatches: monthPool.length,
    },
  };
}

/**
 * Model 12: Monte Carlo Simulation
 * Runs 10,000 simulations using historically-derived probability distributions.
 */
export function monteCarloModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 10, cfg);
  if (!check.sufficient) return insufficientDataResult("monte_carlo", cfg, check);

  const recent = history.slice(-50);
  const freq = counter(recent.flatMap(d => d.mainNumbers));
  const total = [...freq.values()].reduce((a, b) => a + b, 0);
  const nums = range(1, cfg.mainMax);
  const probs = nums.map(n => (freq.get(n) || 0.001) / total);

  const wins = new Map<number, number>();
  const simulations = 10000;
  for (let s = 0; s < simulations; s++) {
    const draw = weightedSampleWithoutReplacement(nums, probs, cfg.mainCount);
    for (const n of draw) wins.set(n, (wins.get(n) || 0) + 1);
  }

  const sorted = [...nums].sort((a, b) => (wins.get(b) || 0) - (wins.get(a) || 0));

  return {
    modelName: "monte_carlo",
    mainNumbers: sorted.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 12),
    confidenceScore: 0.75,
    metadata: { strategy: "monte_carlo_sim", simulations, drawsUsed: recent.length },
  };
}

/**
 * Model 14: Bayesian Posterior
 * Uses Bayesian updating with a Dirichlet prior to estimate number probabilities.
 */
export function bayesianModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const alpha = 1.0;
  const decay = 0.95;
  const pool = range(1, cfg.mainMax);

  const posterior = new Map<number, number>();
  for (const n of pool) posterior.set(n, alpha);

  if (history.length === 0) {
    return insufficientDataResult("bayesian", cfg, { sufficient: false, available: 0, required: 1 });
  }

  const recent = history.slice(-50);
  for (let i = 0; i < recent.length; i++) {
    const recencyWeight = Math.pow(decay, recent.length - 1 - i);
    for (const n of recent[i].mainNumbers) {
      posterior.set(n, (posterior.get(n) || alpha) + recencyWeight);
    }
  }

  const totalPosterior = [...posterior.values()].reduce((a, b) => a + b, 0);
  const weights = pool.map(n => (posterior.get(n) || 0) / totalPosterior);
  const main = deterministicWeightedSelect(pool, weights, cfg.mainCount, 14);

  return {
    modelName: "bayesian",
    mainNumbers: main.sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 14),
    confidenceScore: Math.min(0.75, 0.3 + recent.length * 0.01),
    metadata: { strategy: "bayesian_posterior", priorAlpha: alpha, decay, drawsUsed: recent.length },
  };
}
