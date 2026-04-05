import type { GameConfig, PredictionResult } from "../../../shared/lottery";
import type { HistoryDraw } from "../types";
import { range, counter, deterministicWeightedSelect, checkHistory, insufficientDataResult } from "../helpers";
import { generateSpecialFromHistory } from "../specialNumbers";

/**
 * Models 5-6: Hot-Cold Analysis (70/30 and 50/50 split)
 * Selects from statistically "hot" (frequent) and "cold" (infrequent) number pools.
 */
export function hotColdModel(cfg: GameConfig, history: HistoryDraw[], hotRatio: number, name: string): PredictionResult {
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

  const hotWeights = hot.map(n => freq.get(n) || 1);
  const selectedHot = deterministicWeightedSelect(hot, hotWeights, hotPicks, Math.round(hotRatio * 100));

  const maxFreq = Math.max(...cold.map(n => freq.get(n) || 0), 1);
  const coldWeights = cold.map(n => maxFreq - (freq.get(n) || 0) + 1);
  const selectedCold = deterministicWeightedSelect(cold, coldWeights, coldPicks, Math.round(hotRatio * 100) + 1);

  const selected = [...selectedHot, ...selectedCold];

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
export function balancedHotColdModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const result = hotColdModel(cfg, history, 0.5, "balanced_hot_cold");
  return { ...result, modelName: "balanced_hot_cold", confidenceScore: Math.min(0.65, result.confidenceScore) };
}

/**
 * Model 8: Gap Analysis (Overdue Numbers)
 * Selects numbers that haven't appeared for the longest time.
 */
export function gapAnalysisModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
  const check = checkHistory(history, 20, cfg);
  if (!check.sufficient) return insufficientDataResult("gap_analysis", cfg, check);

  const gaps = new Map<number, number>();
  for (let n = 1; n <= cfg.mainMax; n++) {
    let gap = history.length;
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
 * Model 10: Delta Frequency Analysis
 * Compares short-term vs long-term frequency to find trending numbers.
 */
export function deltaModel(cfg: GameConfig, history: HistoryDraw[]): PredictionResult {
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
