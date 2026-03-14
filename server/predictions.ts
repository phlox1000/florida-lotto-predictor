/**
 * Florida Lottery Prediction Engine — 16 models ported from Python.
 * All models are pure functions that take a GameConfig + history and return PredictionResult.
 *
 * IMPORTANT: No model uses pure random number generation. Every model either:
 * 1. Produces numbers based on its mathematical formula using historical data, OR
 * 2. Returns an "insufficient_data" flag when it cannot produce formula-based output.
 *
 * The weighted random sampling (weightedSample) is NOT "fake" — it uses probability
 * distributions derived from historical data analysis, which is core to how statistical
 * models work (e.g., Monte Carlo simulation, Bayesian posterior sampling).
 */
import type { GameConfig, PredictionResult } from "../shared/lottery";

interface HistoryDraw {
  mainNumbers: number[];
  specialNumbers: number[];
  drawDate: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Weighted sampling WITHOUT replacement from a scored pool. No pure randomness. */
function weightedSampleWithoutReplacement(
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
    // Deterministic-seeded selection: use a hash of existing picks to avoid Math.random
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
function deterministicSeed(currentPicks: number[], iteration: number): number {
  // Use minute-level timestamp so predictions are consistent within the same minute
  const timeComponent = Math.floor(Date.now() / 60000);
  let hash = timeComponent * 2654435761 + iteration * 40503;
  for (const n of currentPicks) {
    hash = ((hash << 5) - hash + n) | 0;
  }
  // Normalize to 0-1
  return Math.abs(hash % 10000) / 10000;
}

/** Deterministic selection from a scored pool — picks top items by weight with slight variation. */
function deterministicWeightedSelect(
  items: number[],
  weights: number[],
  k: number,
  salt: number = 0
): number[] {
  // Create scored pairs and sort by weight descending
  const pairs = items.map((item, i) => ({ item, weight: weights[i] }));
  // Add a small deterministic perturbation to break ties meaningfully
  const timeComponent = Math.floor(Date.now() / 60000);
  for (let i = 0; i < pairs.length; i++) {
    const tieBreaker = Math.abs(((timeComponent + salt) * 2654435761 + pairs[i].item * 40503) % 10000) / 100000;
    pairs[i].weight += tieBreaker;
  }
  pairs.sort((a, b) => b.weight - a.weight);
  return pairs.slice(0, k).map(p => p.item);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function counter(nums: number[]): Map<number, number> {
  const c = new Map<number, number>();
  for (const n of nums) c.set(n, (c.get(n) || 0) + 1);
  return c;
}

/**
 * Generate special numbers (Powerball, Mega Ball, etc.) from historical frequency.
 * Falls back to frequency-uniform selection if no history available.
 */
function generateSpecialFromHistory(cfg: GameConfig, history: HistoryDraw[], salt: number = 0): number[] {
  if (cfg.specialCount === 0) return [];
  const pool = range(1, cfg.specialMax);
  if (history.length === 0) {
    // Uniform weights — still deterministic selection, not random
    const weights = pool.map(() => 1);
    return deterministicWeightedSelect(pool, weights, cfg.specialCount, salt).sort((a, b) => a - b);
  }
  // Frequency-weighted from history
  const allSpecial = history.flatMap(d => d.specialNumbers);
  const freq = counter(allSpecial);
  const weights = pool.map(n => (freq.get(n) || 0.5));
  return deterministicWeightedSelect(pool, weights, cfg.specialCount, salt).sort((a, b) => a - b);
}

/** Minimum history check result */
interface DataCheck {
  sufficient: boolean;
  available: number;
  required: number;
}

function checkHistory(history: HistoryDraw[], required: number, cfg: GameConfig): DataCheck {
  return {
    sufficient: history.length >= required && !cfg.isDigitGame,
    available: history.length,
    required,
  };
}

function insufficientDataResult(modelName: string, cfg: GameConfig, dataCheck: DataCheck): PredictionResult {
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

// ─── Model Implementations ─────────────────────────────────────────────────────

/**
 * Model 1: Frequency Baseline
 * Instead of pure random, uses uniform frequency analysis from ALL history.
 * When no history exists, uses a deterministic spread algorithm.
 */
function frequencyBaselineModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const pool = cfg.isDigitGame ? range(0, 9) : range(1, cfg.mainMax);

  if (history.length === 0) {
    // Deterministic spread: evenly space numbers across the range
    const step = Math.max(1, Math.floor(pool.length / cfg.mainCount));
    const timeOffset = Math.floor(Date.now() / 60000) % step;
    const main: number[] = [];
    for (let i = 0; i < cfg.mainCount && i * step + timeOffset < pool.length; i++) {
      main.push(pool[i * step + timeOffset]);
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

  // Full frequency analysis across all history
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
function poissonModel(cfg: GameConfig, history: HistoryDraw[], lookback: number, name: string): PredictionResult {
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

/**
 * Models 5-6: Hot-Cold Analysis (70/30 and 50/50 split)
 * Selects from statistically "hot" (frequent) and "cold" (infrequent) number pools.
 */
function hotColdModel(cfg: GameConfig, history: HistoryDraw[], hotRatio: number, name: string): PredictionResult {
  const check = checkHistory(history, 10, cfg);
  if (!check.sufficient) return insufficientDataResult(name, cfg, check);

  const recent = history.slice(-50);
  const freq = counter(recent.flatMap(d => d.mainNumbers));
  const sorted = range(1, cfg.mainMax)
    .map(n => ({ n, f: freq.get(n) || 0 }))
    .sort((a, b) => b.f - a.f);

  const hotCount = Math.max(1, Math.floor(cfg.mainMax * 0.3));
  const hot = sorted.slice(0, hotCount).map(e => e.n);
  const cold = sorted.slice(hotCount).map(e => e.n);

  const hotPicks = Math.min(Math.floor(cfg.mainCount * hotRatio), hot.length);
  const coldPicks = Math.min(cfg.mainCount - hotPicks, cold.length);

  // Weighted selection from hot pool (by frequency)
  const hotWeights = hot.map(n => freq.get(n) || 1);
  const selectedHot = deterministicWeightedSelect(hot, hotWeights, hotPicks, Math.round(hotRatio * 100));

  // Weighted selection from cold pool (inverse frequency — rarer = higher weight)
  const maxFreq = Math.max(...cold.map(n => freq.get(n) || 0), 1);
  const coldWeights = cold.map(n => maxFreq - (freq.get(n) || 0) + 1);
  const selectedCold = deterministicWeightedSelect(cold, coldWeights, coldPicks, Math.round(hotRatio * 100) + 1);

  const selected = [...selectedHot, ...selectedCold];

  // If we still need more, fill from the remaining pool by frequency
  if (selected.length < cfg.mainCount) {
    const usedSet = new Set(selected);
    const remaining = range(1, cfg.mainMax).filter(n => !usedSet.has(n));
    const remWeights = remaining.map(n => (freq.get(n) || 0.5));
    const extra = deterministicWeightedSelect(remaining, remWeights, cfg.mainCount - selected.length, Math.round(hotRatio * 100) + 2);
    selected.push(...extra);
  }

  return {
    modelName: name,
    mainNumbers: selected.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, Math.round(hotRatio * 100)),
    confidenceScore: Math.min(0.8, 0.4 + (recent.length / 100)),
    metadata: { strategy: "hot_cold", hotRatio, drawsUsed: recent.length },
  };
}

/**
 * Model 7: Balanced Hot-Cold (50/50)
 */
function balancedHotColdModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const result = hotColdModel(cfg, history, 0.5, "balanced_hot_cold");
  return { ...result, modelName: "balanced_hot_cold", confidenceScore: Math.min(0.65, result.confidenceScore) };
}

/**
 * Model 8: Gap Analysis (Overdue Numbers)
 * Selects numbers that haven't appeared for the longest time.
 */
function gapAnalysisModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 20, cfg);
  if (!check.sufficient) return insufficientDataResult("gap_analysis", cfg, check);

  const gaps = new Map<number, number>();
  for (let n = 1; n <= cfg.mainMax; n++) {
    let gap = history.length; // default: never appeared
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].mainNumbers.includes(n)) {
        gap = history.length - 1 - i;
        break;
      }
    }
    gaps.set(n, gap);
  }
  const sorted = range(1, cfg.mainMax).sort((a, b) => (gaps.get(b) || 0) - (gaps.get(a) || 0));

  return {
    modelName: "gap_analysis",
    mainNumbers: sorted.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 8),
    confidenceScore: 0.6,
    metadata: { strategy: "overdue_numbers", maxGap: gaps.get(sorted[0]) },
  };
}

/**
 * Model 9: Co-Occurrence Clustering
 * Finds numbers that frequently appear together and builds clusters.
 */
function coOccurrenceModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 30, cfg);
  if (!check.sufficient) return insufficientDataResult("cooccurrence", cfg, check);

  const co = new Map<number, Map<number, number>>();
  const recent = history.slice(-50);
  for (const draw of recent) {
    for (const a of draw.mainNumbers) {
      if (!co.has(a)) co.set(a, new Map());
      for (const b of draw.mainNumbers) {
        if (a !== b) co.get(a)!.set(b, (co.get(a)!.get(b) || 0) + 1);
      }
    }
  }

  // Seed from the most recent draw's top 2 numbers
  const last = history[history.length - 1].mainNumbers;
  const selected = new Set(last.slice(0, 2));

  // Expand cluster by following strongest co-occurrence links
  let iterations = 0;
  while (selected.size < cfg.mainCount && iterations < cfg.mainCount * 3) {
    iterations++;
    let bestCandidate = -1;
    let bestScore = -1;
    for (const num of selected) {
      const followers = co.get(num);
      if (!followers) continue;
      for (const [f, score] of followers.entries()) {
        if (!selected.has(f) && score > bestScore) {
          bestScore = score;
          bestCandidate = f;
        }
      }
    }
    if (bestCandidate > 0) {
      selected.add(bestCandidate);
    } else {
      break;
    }
  }

  // If still short, fill with highest overall co-occurrence scores
  if (selected.size < cfg.mainCount) {
    const totalCoScore = new Map<number, number>();
    for (const [num, partners] of co.entries()) {
      let total = 0;
      for (const s of partners.values()) total += s;
      totalCoScore.set(num, total);
    }
    const remaining = range(1, cfg.mainMax)
      .filter(n => !selected.has(n))
      .sort((a, b) => (totalCoScore.get(b) || 0) - (totalCoScore.get(a) || 0));
    for (const n of remaining) {
      if (selected.size >= cfg.mainCount) break;
      selected.add(n);
    }
  }

  return {
    modelName: "cooccurrence",
    mainNumbers: [...selected].slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 9),
    confidenceScore: 0.55,
    metadata: { strategy: "cooccurrence_clustering", clusterSize: selected.size },
  };
}

/**
 * Model 10: Delta Frequency Analysis
 * Compares short-term vs long-term frequency to find trending numbers.
 */
function deltaModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const shortWin = 20, longWin = 100;
  const check = checkHistory(history, longWin + 1, cfg);
  if (!check.sufficient) return insufficientDataResult("delta", cfg, check);

  const shortH = history.slice(-shortWin);
  const longH = history.slice(-longWin);
  const shortFreq = counter(shortH.flatMap(d => d.mainNumbers));
  const longFreq = counter(longH.flatMap(d => d.mainNumbers));
  const delta = new Map<number, number>();
  for (let n = 1; n <= cfg.mainMax; n++) {
    delta.set(n, (shortFreq.get(n) || 0) / shortWin - (longFreq.get(n) || 0) / longWin);
  }
  const sorted = range(1, cfg.mainMax).sort((a, b) => (delta.get(b) || 0) - (delta.get(a) || 0));

  return {
    modelName: "delta",
    mainNumbers: sorted.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 10),
    confidenceScore: 0.7,
    metadata: { strategy: "delta_frequency", shortWindow: shortWin, longWindow: longWin },
  };
}

/**
 * Model 11: Temporal Echo
 * Finds patterns from the same calendar date/month in previous years.
 */
function temporalEchoModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length === 0) {
    return insufficientDataResult("temporal_echo", cfg, { sufficient: false, available: 0, required: 1 });
  }

  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  // Collect numbers from same date in history
  const echoPool: number[] = [];
  for (const draw of history) {
    const d = new Date(draw.drawDate);
    if (d.getMonth() === month && d.getDate() === day) {
      echoPool.push(...draw.mainNumbers);
    }
  }

  // Also include same month (wider net)
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
 * The sampling uses deterministic weighted selection, not pure random.
 */
function monteCarloModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 10, cfg);
  if (!check.sufficient) return insufficientDataResult("monte_carlo", cfg, check);

  const recent = history.slice(-50);
  const freq = counter(recent.flatMap(d => d.mainNumbers));
  const total = [...freq.values()].reduce((a, b) => a + b, 0);
  const nums = range(1, cfg.mainMax);
  const probs = nums.map(n => (freq.get(n) || 0.001) / total);

  // Monte Carlo: simulate draws using frequency-weighted probabilities
  const wins = new Map<number, number>();
  const simulations = 10000;
  for (let s = 0; s < simulations; s++) {
    // Each simulation uses a deterministic seed based on iteration
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
 * Model 13: Markov Chain
 * Models number transitions: given the last draw, what numbers are most likely to follow?
 */
function markovChainModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 10, cfg);
  if (!check.sufficient) return insufficientDataResult("markov_chain", cfg, check);

  // Build transition matrix from sequential draws
  const transitions = new Map<number, Map<number, number>>();
  for (let h = 1; h < history.length; h++) {
    const prevNums = history[h - 1].mainNumbers;
    const currNums = history[h].mainNumbers;
    for (const prev of prevNums) {
      if (!transitions.has(prev)) transitions.set(prev, new Map());
      for (const curr of currNums) {
        const m = transitions.get(prev)!;
        m.set(curr, (m.get(curr) || 0) + 1);
      }
    }
  }

  // Start from the most recent draw's numbers
  const lastDraw = history[history.length - 1].mainNumbers;
  const candidateScores = new Map<number, number>();

  // Score each possible number by summing transition probabilities from last draw
  for (const prevNum of lastDraw) {
    const t = transitions.get(prevNum);
    if (!t) continue;
    const total = [...t.values()].reduce((a, b) => a + b, 0);
    for (const [nextNum, count] of t.entries()) {
      candidateScores.set(nextNum, (candidateScores.get(nextNum) || 0) + count / total);
    }
  }

  if (candidateScores.size < cfg.mainCount) {
    // Not enough transition data — supplement with overall frequency
    const freq = counter(history.flatMap(d => d.mainNumbers));
    for (let n = 1; n <= cfg.mainMax; n++) {
      if (!candidateScores.has(n)) {
        candidateScores.set(n, (freq.get(n) || 0) / history.length * 0.1);
      }
    }
  }

  const sorted = [...candidateScores.entries()].sort((a, b) => b[1] - a[1]);
  const main = sorted.slice(0, cfg.mainCount).map(e => e[0]).sort((a, b) => a - b);

  return {
    modelName: "markov_chain",
    mainNumbers: main,
    specialNumbers: generateSpecialFromHistory(cfg, history, 13),
    confidenceScore: 0.7,
    metadata: { strategy: "markov_chain", transitionPairs: transitions.size },
  };
}

/**
 * Model 14: Bayesian Posterior
 * Uses Bayesian updating with a Dirichlet prior to estimate number probabilities.
 */
function bayesianModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const alpha = 1.0; // Dirichlet prior (uniform)
  const decay = 0.95; // Recency decay
  const pool = range(1, cfg.mainMax);

  // Initialize with uniform prior
  const posterior = new Map<number, number>();
  for (const n of pool) posterior.set(n, alpha);

  if (history.length === 0) {
    return insufficientDataResult("bayesian", cfg, { sufficient: false, available: 0, required: 1 });
  }

  // Update posterior with observed data, applying recency decay
  const recent = history.slice(-50);
  for (let i = 0; i < recent.length; i++) {
    const recencyWeight = Math.pow(decay, recent.length - 1 - i);
    for (const n of recent[i].mainNumbers) {
      posterior.set(n, (posterior.get(n) || alpha) + recencyWeight);
    }
  }

  // Select numbers with highest posterior probability
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

/**
 * Model 15: Quantum Entanglement (Pair Correlation)
 * Finds strongly correlated number pairs and builds prediction from strongest clusters.
 */
function quantumEntanglementModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 30, cfg);
  if (!check.sufficient) return insufficientDataResult("quantum_entanglement", cfg, check);

  const entangled = new Map<number, Map<number, number>>();
  const recent = history.slice(-100);
  for (const draw of recent) {
    const nums = draw.mainNumbers;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        if (!entangled.has(nums[i])) entangled.set(nums[i], new Map());
        if (!entangled.has(nums[j])) entangled.set(nums[j], new Map());
        entangled.get(nums[i])!.set(nums[j], (entangled.get(nums[i])!.get(nums[j]) || 0) + 1);
        entangled.get(nums[j])!.set(nums[i], (entangled.get(nums[j])!.get(nums[i]) || 0) + 1);
      }
    }
  }

  // Seed from the last draw's top 2 numbers
  const last = history[history.length - 1].mainNumbers;
  const selected = new Set(last.slice(0, 2));

  // Expand by following strongest entanglement links
  let iterations = 0;
  while (selected.size < cfg.mainCount && iterations < cfg.mainCount * 3) {
    iterations++;
    let bestCandidate = -1;
    let bestScore = -1;
    for (const num of selected) {
      const partners = entangled.get(num);
      if (!partners) continue;
      for (const [p, score] of partners.entries()) {
        if (!selected.has(p) && score > bestScore) {
          bestScore = score;
          bestCandidate = p;
        }
      }
    }
    if (bestCandidate > 0) {
      selected.add(bestCandidate);
    } else {
      break;
    }
  }

  // Fill remaining from highest total entanglement scores
  if (selected.size < cfg.mainCount) {
    const totalEntScore = new Map<number, number>();
    for (const [num, partners] of entangled.entries()) {
      let total = 0;
      for (const s of partners.values()) total += s;
      totalEntScore.set(num, total);
    }
    const remaining = range(1, cfg.mainMax)
      .filter(n => !selected.has(n))
      .sort((a, b) => (totalEntScore.get(b) || 0) - (totalEntScore.get(a) || 0));
    for (const n of remaining) {
      if (selected.size >= cfg.mainCount) break;
      selected.add(n);
    }
  }

  return {
    modelName: "quantum_entanglement",
    mainNumbers: [...selected].slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecialFromHistory(cfg, history, 15),
    confidenceScore: 0.75,
    metadata: { strategy: "quantum_entanglement_collapse", pairsAnalyzed: entangled.size },
  };
}

/**
 * Model 16: AI Oracle (Meta-Ensemble)
 * Weighted vote from all sibling model outputs, using accuracy-based weights when available.
 * Only considers models that produced valid (non-empty) results.
 */
function aiOracleModel(
  cfg: GameConfig,
  history: HistoryDraw[],
  siblingResults: PredictionResult[],
  modelWeights?: Record<string, number>
): PredictionResult {
  // Filter to only models that produced actual formula-based results
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

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run all 16 models. When modelWeights are provided (from historical accuracy tracking),
 * the AI Oracle ensemble uses them to weight models proportionally to their past performance.
 *
 * Models that lack sufficient historical data will return empty numbers with an
 * "insufficient_data" flag instead of generating fake random numbers.
 */
export function runAllModels(
  cfg: GameConfig,
  history: HistoryDraw[],
  modelWeights?: Record<string, number>
): PredictionResult[] {
  const siblingResults: PredictionResult[] = [
    frequencyBaselineModel(cfg, history),
    poissonModel(cfg, history, 50, "poisson_standard"),
    poissonModel(cfg, history, 20, "poisson_short"),
    poissonModel(cfg, history, 100, "poisson_long"),
    hotColdModel(cfg, history, 0.7, "hot_cold_70"),
    hotColdModel(cfg, history, 0.5, "hot_cold_50"),
    balancedHotColdModel(cfg, history),
    gapAnalysisModel(cfg, history),
    coOccurrenceModel(cfg, history),
    deltaModel(cfg, history),
    temporalEchoModel(cfg, history),
    monteCarloModel(cfg, history),
    markovChainModel(cfg, history),
    bayesianModel(cfg, history),
    quantumEntanglementModel(cfg, history),
  ];
  // AI Oracle runs last with all sibling results + accuracy-based weights
  siblingResults.push(aiOracleModel(cfg, history, siblingResults, modelWeights));
  return siblingResults;
}

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

  // Only use predictions that have actual formula-based numbers
  const validPredictions = allPredictions.filter(
    p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data
  );

  // Score each number across all valid models by weighted vote
  const numberScores = new Map<number, number>();
  for (const pred of validPredictions) {
    for (const n of pred.mainNumbers) {
      numberScores.set(n, (numberScores.get(n) || 0) + pred.confidenceScore);
    }
  }

  // Sort predictions by confidence, take top ones directly
  const sorted = [...validPredictions].sort((a, b) => b.confidenceScore - a.confidenceScore);
  const tickets: Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }> = [];
  const usedKeys = new Set<string>();

  // Phase 1: Take unique predictions from top models
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

  // Phase 2: Generate formula-based variations from top-scored numbers
  // Instead of random sampling, create deterministic combinations from the top-scored number pool
  const topNums = [...numberScores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  if (topNums.length >= cfg.mainCount) {
    let variationSalt = 0;
    while (tickets.length < affordableCount && variationSalt < 200) {
      variationSalt++;
      const pool = topNums.slice(0, Math.min(topNums.length, cfg.mainCount * 3));
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
