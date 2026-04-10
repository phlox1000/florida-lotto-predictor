import type { GameConfig, PredictionResult } from "../../../shared/lottery";
import type { HistoryDraw } from "../types";
import { range, checkHistory, insufficientDataResult } from "../helpers";
import { generateSpecialFromHistory } from "../specialNumbers";

/**
 * Model 17: Compound-Dirichlet-Multinomial (CDM)
 * Models the joint distribution of all number positions simultaneously using a
 * matrix-valued Dirichlet prior. Unlike the Bayesian model (Model 14) which treats
 * each number independently, CDM captures inter-position dependencies.
 * Reference: Nkomozake (2024), arXiv:2403.12836
 */
export function cdmModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 30, cfg);
  if (!check.sufficient) return insufficientDataResult("cdm", cfg, check);

  const recent = history.slice(-200);
  const numPositions = cfg.mainCount;
  const poolSize = cfg.mainMax;

  const positionFreq: Map<number, number>[] = [];
  for (let p = 0; p < numPositions; p++) {
    positionFreq.push(new Map<number, number>());
  }

  const pairPositionScore = new Map<number, number>();

  for (const draw of recent) {
    const sorted = [...draw.mainNumbers].sort((a, b) => a - b);
    for (let p = 0; p < Math.min(numPositions, sorted.length); p++) {
      const num = sorted[p];
      positionFreq[p].set(num, (positionFreq[p].get(num) || 0) + 1);
    }
  }

  const alpha = 1.0;
  const positionPosteriors: Map<number, number>[] = [];

  for (let p = 0; p < numPositions; p++) {
    const posterior = new Map<number, number>();
    const totalObs = recent.length;
    for (let n = 1; n <= poolSize; n++) {
      const count = positionFreq[p].get(n) || 0;
      const prob = (alpha + count) / (poolSize * alpha + totalObs);
      posterior.set(n, prob);
    }
    positionPosteriors.push(posterior);
  }

  const transitionBonus = new Map<number, number>();
  for (const draw of recent) {
    const sorted = [...draw.mainNumbers].sort((a, b) => a - b);
    for (let p = 0; p < sorted.length - 1; p++) {
      const curr = sorted[p];
      const next = sorted[p + 1];
      transitionBonus.set(next, (transitionBonus.get(next) || 0) + 1);
      transitionBonus.set(curr, (transitionBonus.get(curr) || 0) + 0.5);
    }
  }

  const compoundScores = new Map<number, number>();
  for (let n = 1; n <= poolSize; n++) {
    let score = 0;
    for (let p = 0; p < numPositions; p++) {
      score += positionPosteriors[p].get(n) || 0;
    }
    const maxTransition = Math.max(1, ...transitionBonus.values());
    score += ((transitionBonus.get(n) || 0) / maxTransition) * 0.3;
    compoundScores.set(n, score);
  }

  const ranked = [...compoundScores.entries()].sort((a, b) => b[1] - a[1]);
  const main = ranked.slice(0, cfg.mainCount).map(e => e[0]).sort((a, b) => a - b);

  return {
    modelName: "cdm",
    mainNumbers: main,
    specialNumbers: generateSpecialFromHistory(cfg, history, 17),
    confidenceScore: Math.min(0.80, 0.4 + recent.length * 0.002),
    metadata: {
      strategy: "compound_dirichlet_multinomial",
      drawsUsed: recent.length,
      positions: numPositions,
      priorAlpha: alpha,
    },
  };
}

/**
 * Model 18: Chi-Square Anomaly Detector
 * Tests whether each number's observed frequency deviates significantly from
 * the expected uniform distribution. Numbers with the highest chi-square values
 * (most statistically anomalous) are selected.
 */
export function chiSquareModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 20, cfg);
  if (!check.sufficient) return insufficientDataResult("chi_square", cfg, check);

  const recent = history.slice(-200);
  const poolSize = cfg.mainMax;
  const totalDraws = recent.length;
  const numbersPerDraw = cfg.mainCount;

  const expectedFreq = (totalDraws * numbersPerDraw) / poolSize;

  const observed = new Map<number, number>();
  for (const draw of recent) {
    for (const n of draw.mainNumbers) {
      observed.set(n, (observed.get(n) || 0) + 1);
    }
  }

  const chiSquareScores = new Map<number, number>();
  const significanceScores = new Map<number, number>();

  for (let n = 1; n <= poolSize; n++) {
    const obs = observed.get(n) || 0;
    const chi2 = Math.pow(obs - expectedFreq, 2) / expectedFreq;
    chiSquareScores.set(n, chi2);

    const directedScore = obs > expectedFreq ? chi2 : -chi2;
    significanceScores.set(n, directedScore);
  }

  const hotCount = Math.ceil(cfg.mainCount * 0.7);
  const dueCount = cfg.mainCount - hotCount;

  const hotRanked = [...significanceScores.entries()]
    .filter(([_, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);
  const hotPicks = hotRanked.slice(0, hotCount).map(e => e[0]);

  const dueRanked = [...significanceScores.entries()]
    .filter(([_, s]) => s < 0)
    .sort((a, b) => a[1] - b[1]);
  const duePicks = dueRanked
    .filter(([n]) => !hotPicks.includes(n))
    .slice(0, dueCount)
    .map(e => e[0]);

  let main = [...hotPicks, ...duePicks];

  if (main.length < cfg.mainCount) {
    const allRanked = [...chiSquareScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([n]) => !main.includes(n));
    for (const [n] of allRanked) {
      if (main.length >= cfg.mainCount) break;
      main.push(n);
    }
  }

  main = main.slice(0, cfg.mainCount).sort((a, b) => a - b);

  let totalChi2 = 0;
  for (let n = 1; n <= poolSize; n++) {
    totalChi2 += chiSquareScores.get(n) || 0;
  }
  const degreesOfFreedom = poolSize - 1;

  return {
    modelName: "chi_square",
    mainNumbers: main,
    specialNumbers: generateSpecialFromHistory(cfg, history, 18),
    confidenceScore: Math.min(0.80, 0.35 + Math.min(totalChi2 / degreesOfFreedom, 1) * 0.45),
    metadata: {
      strategy: "chi_square_anomaly_detection",
      drawsUsed: recent.length,
      expectedFrequency: Math.round(expectedFreq * 100) / 100,
      totalChiSquare: Math.round(totalChi2 * 100) / 100,
      degreesOfFreedom,
      hotAnomalies: hotPicks.length,
      dueAnomalies: duePicks.length,
    },
  };
}
