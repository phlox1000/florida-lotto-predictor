/**
 * Florida Lottery Prediction Engine — 16 models ported from Python.
 * All models are pure functions that take a GameConfig + history and return PredictionResult.
 */
import type { GameConfig, PredictionResult } from "../shared/lottery";

interface HistoryDraw {
  mainNumbers: number[];
  specialNumbers: number[];
  drawDate: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(pool: number[], count: number): number[] {
  const copy = [...pool];
  const result: number[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function weightedChoices(items: number[], weights: number[], k: number): number[] {
  const totalW = weights.reduce((a, b) => a + b, 0);
  const result: number[] = [];
  for (let i = 0; i < k; i++) {
    let r = Math.random() * totalW;
    for (let j = 0; j < items.length; j++) {
      r -= weights[j];
      if (r <= 0) { result.push(items[j]); break; }
    }
    if (result.length <= i) result.push(items[items.length - 1]);
  }
  return result;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function counter(nums: number[]): Map<number, number> {
  const c = new Map<number, number>();
  for (const n of nums) c.set(n, (c.get(n) || 0) + 1);
  return c;
}

function generateSpecial(cfg: GameConfig): number[] {
  if (cfg.specialCount === 0) return [];
  return sample(range(1, cfg.specialMax), cfg.specialCount).sort((a, b) => a - b);
}

function generateRandomMain(cfg: GameConfig): number[] {
  if (cfg.isDigitGame) {
    return Array.from({ length: cfg.mainCount }, () => randInt(0, 9));
  }
  return sample(range(1, cfg.mainMax), cfg.mainCount).sort((a, b) => a - b);
}

// ─── Model Implementations ─────────────────────────────────────────────────────

function randomModel(cfg: GameConfig, _history: HistoryDraw[]): PredictionResult {
  return {
    modelName: "random",
    mainNumbers: generateRandomMain(cfg),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.5,
    metadata: { strategy: "pure_random" },
  };
}

function poissonModel(cfg: GameConfig, history: HistoryDraw[], lookback: number, name: string): PredictionResult {
  if (history.length < 10 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: name, metadata: { strategy: "poisson", lookback, fallback: true } };
  }
  const recent = history.slice(-lookback);
  const total = recent.length;
  const allNums = recent.flatMap(d => d.mainNumbers);
  const obs = counter(allNums);
  const probs = new Map<number, number>();
  for (let n = 1; n <= cfg.mainMax; n++) {
    probs.set(n, 1 - Math.exp(-(obs.get(n) || 0) / total));
  }
  const sorted = range(1, cfg.mainMax).sort((a, b) => (probs.get(b) || 0) - (probs.get(a) || 0));
  const main = sorted.slice(0, cfg.mainCount).sort((a, b) => a - b);
  const avgProb = main.reduce((s, n) => s + (probs.get(n) || 0), 0) / main.length;
  return {
    modelName: name,
    mainNumbers: main,
    specialNumbers: generateSpecial(cfg),
    confidenceScore: Math.min(0.95, avgProb),
    metadata: { strategy: "poisson", lookback },
  };
}

function hotColdModel(cfg: GameConfig, history: HistoryDraw[], hotRatio: number, name: string): PredictionResult {
  if (history.length < 10 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: name };
  }
  const recent = history.slice(-50);
  const freq = counter(recent.flatMap(d => d.mainNumbers));
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const hotCount = Math.max(1, Math.floor(cfg.mainMax * 0.3));
  const hot = sorted.slice(0, hotCount).map(e => e[0]);
  const cold = range(1, cfg.mainMax).filter(n => !hot.includes(n));
  const hotPicks = Math.min(Math.floor(cfg.mainCount * hotRatio), hot.length);
  const coldPicks = Math.min(cfg.mainCount - hotPicks, cold.length);
  let selected = [...sample(hot, hotPicks), ...sample(cold, coldPicks)];
  const used = new Set(selected);
  while (selected.length < cfg.mainCount) {
    const x = randInt(1, cfg.mainMax);
    if (!used.has(x)) { selected.push(x); used.add(x); }
  }
  return {
    modelName: name,
    mainNumbers: selected.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: hotRatio,
    metadata: { strategy: "hot_cold", hotRatio },
  };
}

function balancedHotColdModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  return { ...hotColdModel(cfg, history, 0.5, "balanced_hot_cold"), modelName: "balanced_hot_cold", confidenceScore: 0.65 };
}

function gapAnalysisModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length < 20 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: "gap_analysis" };
  }
  const gaps = new Map<number, number>();
  for (let n = 1; n <= cfg.mainMax; n++) {
    let lastIdx = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].mainNumbers.includes(n)) { lastIdx = history.length - 1 - i; break; }
    }
    gaps.set(n, lastIdx);
  }
  const sorted = range(1, cfg.mainMax).sort((a, b) => (gaps.get(b) || 0) - (gaps.get(a) || 0));
  return {
    modelName: "gap_analysis",
    mainNumbers: sorted.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.6,
    metadata: { strategy: "overdue_numbers" },
  };
}

function coOccurrenceModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length < 30 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: "cooccurrence" };
  }
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
  const last = history[history.length - 1].mainNumbers;
  const selected = new Set(last.slice(0, 2));
  for (const num of selected) {
    if (selected.size >= cfg.mainCount) break;
    const followers = co.get(num);
    if (followers) {
      const best = [...followers.entries()].sort((a, b) => b[1] - a[1]);
      for (const [f] of best) {
        if (!selected.has(f)) { selected.add(f); break; }
      }
    }
  }
  while (selected.size < cfg.mainCount) selected.add(randInt(1, cfg.mainMax));
  return {
    modelName: "cooccurrence",
    mainNumbers: [...selected].slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.55,
    metadata: { strategy: "cooccurrence_clustering" },
  };
}

function deltaModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const shortWin = 20, longWin = 100;
  if (history.length < longWin + 1 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: "delta" };
  }
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
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.7,
    metadata: { strategy: "delta_frequency" },
  };
}

function temporalEchoModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length === 0) return { ...randomModel(cfg, history), modelName: "temporal_echo" };
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
  if (echoPool.length < cfg.mainCount) return { ...randomModel(cfg, history), modelName: "temporal_echo" };
  const freq = counter(echoPool);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const main = sorted.slice(0, cfg.mainCount).map(e => e[0]).sort((a, b) => a - b);
  return {
    modelName: "temporal_echo",
    mainNumbers: main,
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.65,
    metadata: { strategy: "seasonal_echo" },
  };
}

function monteCarloModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length < 10 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: "monte_carlo" };
  }
  const recent = history.slice(-50);
  const freq = counter(recent.flatMap(d => d.mainNumbers));
  const total = [...freq.values()].reduce((a, b) => a + b, 0);
  const nums = range(1, cfg.mainMax);
  const probs = nums.map(n => (freq.get(n) || 0.001) / total);
  const wins = new Map<number, number>();
  const simulations = 10000;
  for (let s = 0; s < simulations; s++) {
    const draw = weightedChoices(nums, probs, cfg.mainCount);
    for (const n of draw) wins.set(n, (wins.get(n) || 0) + 1);
  }
  const sorted = nums.sort((a, b) => (wins.get(b) || 0) - (wins.get(a) || 0));
  return {
    modelName: "monte_carlo",
    mainNumbers: sorted.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.75,
    metadata: { strategy: "monte_carlo_sim", simulations },
  };
}

function markovChainModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length < 2 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: "markov_chain" };
  }
  const transitions = new Map<number, Map<number, number>>();
  for (const draw of history.slice(-100)) {
    const nums = draw.mainNumbers;
    for (let i = 0; i < nums.length - 1; i++) {
      if (!transitions.has(nums[i])) transitions.set(nums[i], new Map());
      const m = transitions.get(nums[i])!;
      m.set(nums[i + 1], (m.get(nums[i + 1]) || 0) + 1);
    }
  }
  const last = history[history.length - 1].mainNumbers;
  let current = last[0] || randInt(1, cfg.mainMax);
  const selected = new Set([current]);
  for (let i = 0; i < cfg.mainCount - 1; i++) {
    const t = transitions.get(current);
    if (t && t.size > 0) {
      const keys = [...t.keys()];
      const vals = [...t.values()];
      current = weightedChoices(keys, vals, 1)[0];
    } else {
      current = randInt(1, cfg.mainMax);
    }
    selected.add(current);
  }
  const main = [...selected];
  while (main.length < cfg.mainCount) {
    const x = randInt(1, cfg.mainMax);
    if (!main.includes(x)) main.push(x);
  }
  return {
    modelName: "markov_chain",
    mainNumbers: main.slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.7,
    metadata: { strategy: "markov_chain" },
  };
}

function bayesianModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const alpha = 1.0;
  const decay = 0.95;
  const counts = new Map<number, number>();
  for (let n = 1; n <= cfg.mainMax; n++) counts.set(n, alpha);
  // decay + observe
  if (history.length > 0) {
    for (const draw of history.slice(-50)) {
      for (const n of draw.mainNumbers) {
        counts.set(n, (counts.get(n) || alpha) + 1);
      }
    }
    for (const [k, v] of counts) counts.set(k, v * decay);
  }
  const nums = range(1, cfg.mainMax);
  const total = nums.reduce((s, n) => s + (counts.get(n) || 0), 0) || 1;
  const weights = nums.map(n => (counts.get(n) || 0) / total);
  const picked = new Set<number>();
  while (picked.size < cfg.mainCount) {
    const c = weightedChoices(nums, weights, 1)[0];
    picked.add(c);
  }
  return {
    modelName: "bayesian",
    mainNumbers: [...picked].sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.7,
    metadata: { strategy: "bayesian_posterior" },
  };
}

function quantumEntanglementModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  if (history.length < 30 || cfg.isDigitGame) {
    return { ...randomModel(cfg, history), modelName: "quantum_entanglement" };
  }
  const entangled = new Map<number, Map<number, number>>();
  for (const draw of history.slice(-100)) {
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
  const last = history[history.length - 1].mainNumbers;
  const selected = new Set(last.slice(0, 2));
  for (const num of [...selected]) {
    if (selected.size >= cfg.mainCount) break;
    const partners = entangled.get(num);
    if (partners) {
      const best = [...partners.entries()].sort((a, b) => b[1] - a[1]);
      for (const [p] of best) {
        if (!selected.has(p)) { selected.add(p); break; }
      }
    }
  }
  while (selected.size < cfg.mainCount) selected.add(randInt(1, cfg.mainMax));
  return {
    modelName: "quantum_entanglement",
    mainNumbers: [...selected].slice(0, cfg.mainCount).sort((a, b) => a - b),
    specialNumbers: generateSpecial(cfg),
    confidenceScore: 0.75,
    metadata: { strategy: "quantum_entanglement_collapse" },
  };
}

function aiOracleModel(cfg: GameConfig, history: HistoryDraw[], siblingResults: PredictionResult[]): PredictionResult {
  // Meta-ensemble: weighted vote from all sibling model outputs
  const votes = new Map<number, number>();
  let confAccum = 0;
  for (const pred of siblingResults) {
    const w = pred.confidenceScore;
    for (const n of pred.mainNumbers) {
      votes.set(n, (votes.get(n) || 0) + w);
    }
    confAccum += w;
  }
  let main: number[];
  if (votes.size === 0) {
    main = generateRandomMain(cfg);
  } else {
    const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    main = sorted.slice(0, cfg.mainCount).map(e => e[0]).sort((a, b) => a - b);
  }
  return {
    modelName: "ai_oracle",
    mainNumbers: main,
    specialNumbers: generateSpecial(cfg),
    confidenceScore: Math.min(0.95, confAccum / Math.max(1, siblingResults.length)),
    metadata: { strategy: "adaptive_meta_ensemble", modelCount: siblingResults.length },
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export function runAllModels(cfg: GameConfig, history: HistoryDraw[]): PredictionResult[] {
  const siblingResults: PredictionResult[] = [
    randomModel(cfg, history),
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
  // AI Oracle runs last with all sibling results
  siblingResults.push(aiOracleModel(cfg, history, siblingResults));
  return siblingResults;
}

/**
 * Budget-aware ticket selector: picks exactly `ticketCount` tickets within `budget`.
 * Uses a multi-step filtering process combining all model outputs.
 */
export function selectBudgetTickets(
  cfg: GameConfig,
  allPredictions: PredictionResult[],
  budget: number = 75,
  maxTickets: number = 20,
): { tickets: Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }>; totalCost: number } {
  const ticketPrice = cfg.ticketPrice;
  const affordableCount = Math.min(maxTickets, Math.floor(budget / ticketPrice));

  // Score each number across all models by weighted vote
  const numberScores = new Map<number, number>();
  for (const pred of allPredictions) {
    for (const n of pred.mainNumbers) {
      numberScores.set(n, (numberScores.get(n) || 0) + pred.confidenceScore);
    }
  }

  // Sort predictions by confidence, take top ones directly
  const sorted = [...allPredictions].sort((a, b) => b.confidenceScore - a.confidenceScore);
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

  // Phase 2: Generate variations from top-scored numbers to fill remaining slots
  const topNums = [...numberScores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  let attempts = 0;
  while (tickets.length < affordableCount && attempts < 1000) {
    attempts++;
    let main: number[];
    if (cfg.isDigitGame) {
      main = Array.from({ length: cfg.mainCount }, () => randInt(0, 9));
    } else {
      // Bias toward top numbers but add variation
      const pool = topNums.length >= cfg.mainCount ? topNums : range(1, cfg.mainMax);
      const biasedPool = pool.slice(0, Math.min(pool.length, cfg.mainCount * 3));
      main = sample(biasedPool, cfg.mainCount).sort((a, b) => a - b);
    }
    const special = generateSpecial(cfg);
    const key = main.join(",") + "|" + special.join(",");
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      tickets.push({
        mainNumbers: main,
        specialNumbers: special,
        modelSource: "budget_variation",
        confidence: 0.5,
      });
    }
  }

  return {
    tickets: tickets.slice(0, affordableCount),
    totalCost: tickets.slice(0, affordableCount).length * ticketPrice,
  };
}
