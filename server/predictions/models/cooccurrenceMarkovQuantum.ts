import type { GameConfig, PredictionResult } from "../../../shared/lottery";
import type { HistoryDraw } from "../types";
import { range, counter, checkHistory, insufficientDataResult } from "../helpers";
import { generateSpecialFromHistory } from "../specialNumbers";

/**
 * Model 9: Co-Occurrence Clustering
 * Finds numbers that frequently appear together and builds clusters.
 */
export function coOccurrenceModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
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

  const last = history[history.length - 1].mainNumbers;
  const selected = new Set(last.slice(0, 2));

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
 * Model 13: Markov Chain
 * Models number transitions: given the last draw, what numbers are most likely to follow?
 */
export function markovChainModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 10, cfg);
  if (!check.sufficient) return insufficientDataResult("markov_chain", cfg, check);

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

  const lastDraw = history[history.length - 1].mainNumbers;
  const candidateScores = new Map<number, number>();

  for (const prevNum of lastDraw) {
    const t = transitions.get(prevNum);
    if (!t) continue;
    const total = [...t.values()].reduce((a, b) => a + b, 0);
    for (const [nextNum, count] of t.entries()) {
      candidateScores.set(nextNum, (candidateScores.get(nextNum) || 0) + count / total);
    }
  }

  if (candidateScores.size < cfg.mainCount) {
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
 * Model 15: Quantum Entanglement (Pair Correlation)
 * Finds strongly correlated number pairs and builds prediction from strongest clusters.
 */
export function quantumEntanglementModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
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

  const last = history[history.length - 1].mainNumbers;
  const selected = new Set(last.slice(0, 2));

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
