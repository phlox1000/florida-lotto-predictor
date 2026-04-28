import type { GameConfig, PredictionResult } from "@shared/lottery";
import type { HistoryDraw } from "../predictions/types";

export type ConfidenceLabel = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

export interface SupportingFactor {
  key: string;
  value: number;
  weight: number;
  contribution: number;
  note: string;
}

export interface ExplainableScore {
  aiScore: number;
  confidenceLabel: ConfidenceLabel;
  explanationSummary: string;
  supportingFactors: SupportingFactor[];
  riskLevel: RiskLevel;
  modelAgreement: number;
  historicalSignals: Record<string, unknown>;
  generatedAt: string;
  correlationId?: string;
  llm: {
    attempted: boolean;
    used: boolean;
    fallbackReason?: string;
  };
  factorSnapshot: Record<string, number>;
}

interface SignalStats {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

interface ScoringContext {
  frequencyNorm: Map<number, number>;
  recentFrequencyNorm: Map<number, number>;
  overdueNorm: Map<number, number>;
  topPairs: Set<string>;
  topTriples: Set<string>;
  sumStats: SignalStats;
  spreadStats: SignalStats;
  volatility: number;
  drawCount: number;
  factorWeights: Record<string, number>;
}

const BASE_FACTOR_WEIGHTS: Record<string, number> = {
  historicalFrequency: 0.14,
  recentFrequency: 0.12,
  overdueBalance: 0.1,
  hotColdBalance: 0.08,
  oddEvenBalance: 0.09,
  highLowBalance: 0.08,
  sumRange: 0.11,
  spread: 0.08,
  clusteringAvoidance: 0.08,
  repeatedPairs: 0.05,
  repeatedTriples: 0.03,
  modelPerformance: 0.04,
};

function clamp(v: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function toStats(values: number[]): SignalStats {
  if (values.length === 0) return { mean: 0, min: 0, max: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return {
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev: Math.sqrt(variance),
  };
}

function normalizeMap(map: Map<number, number>, fallback = 0.5) {
  const vals = [...map.values()];
  if (vals.length === 0) return new Map<number, number>();
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = Math.max(max - min, 1e-9);
  const out = new Map<number, number>();
  for (const [k, v] of map.entries()) {
    out.set(k, max === min ? fallback : (v - min) / range);
  }
  return out;
}

function pairKey(a: number, b: number) {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function tripleKey(nums: number[]) {
  return [...nums].sort((a, b) => a - b).join(":");
}

function buildScoringContext(
  cfg: GameConfig,
  history: HistoryDraw[],
  learningWeights?: Record<string, number>,
): ScoringContext {
  const frequency = new Map<number, number>();
  const recentFrequency = new Map<number, number>();
  const overdueRaw = new Map<number, number>();
  const pairCounts = new Map<string, number>();
  const tripleCounts = new Map<string, number>();

  for (let i = 1; i <= cfg.mainMax; i++) {
    frequency.set(i, 0);
    recentFrequency.set(i, 0);
    overdueRaw.set(i, history.length + 1);
  }

  history.forEach((draw, idx) => {
    const numbers = [...draw.mainNumbers].sort((a, b) => a - b);
    for (const n of numbers) {
      frequency.set(n, (frequency.get(n) || 0) + 1);
      if (idx < 25) recentFrequency.set(n, (recentFrequency.get(n) || 0) + 1);
      overdueRaw.set(n, Math.min(overdueRaw.get(n) || history.length + 1, idx + 1));
    }
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        const key = pairKey(numbers[i], numbers[j]);
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
    if (numbers.length >= 3) {
      for (let i = 0; i < numbers.length - 2; i++) {
        const key = tripleKey([numbers[i], numbers[i + 1], numbers[i + 2]]);
        tripleCounts.set(key, (tripleCounts.get(key) || 0) + 1);
      }
    }
  });

  const sums = history.map(h => h.mainNumbers.reduce((a, b) => a + b, 0));
  const spreads = history.map(h => {
    const sorted = [...h.mainNumbers].sort((a, b) => a - b);
    return sorted[sorted.length - 1] - sorted[0];
  });

  const volatilityBase = toStats(sums);
  const factorWeights: Record<string, number> = { ...BASE_FACTOR_WEIGHTS };
  if (learningWeights) {
    for (const key of Object.keys(factorWeights)) {
      const learned = learningWeights[key];
      if (typeof learned === "number" && Number.isFinite(learned)) {
        factorWeights[key] = clamp(factorWeights[key] * learned, 0.02, 0.25);
      }
    }
  }

  const total = Object.values(factorWeights).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const key of Object.keys(factorWeights)) factorWeights[key] /= total;
  }

  const topPairs = new Set(
    [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k]) => k),
  );
  const topTriples = new Set(
    [...tripleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k]) => k),
  );

  return {
    frequencyNorm: normalizeMap(frequency),
    recentFrequencyNorm: normalizeMap(recentFrequency),
    overdueNorm: normalizeMap(overdueRaw),
    topPairs,
    topTriples,
    sumStats: toStats(sums),
    spreadStats: toStats(spreads),
    volatility: clamp(volatilityBase.stdDev / Math.max(1, volatilityBase.mean), 0, 1),
    drawCount: history.length,
    factorWeights,
  };
}

function scoreOne(
  cfg: GameConfig,
  pred: PredictionResult,
  ctx: ScoringContext,
  generatedAt: string,
  modelWeight: number,
  modelAgreement: number,
  correlationId?: string,
): ExplainableScore {
  const nums = [...pred.mainNumbers].sort((a, b) => a - b);
  if (nums.length === 0) {
    return {
      aiScore: 0,
      confidenceLabel: "low",
      explanationSummary: "Insufficient data for this model output; no statistically valid pick generated.",
      supportingFactors: [],
      riskLevel: "high",
      modelAgreement: 0,
      historicalSignals: { drawCount: ctx.drawCount, volatility: ctx.volatility },
      generatedAt,
      correlationId,
      llm: {
        attempted: false,
        used: false,
        fallbackReason: "Deterministic scoring is source of truth; model marked insufficient_data.",
      },
      factorSnapshot: {},
    };
  }
  const numCount = Math.max(nums.length, 1);

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const factors: SupportingFactor[] = [];

  const histFreq = avg(nums.map(n => ctx.frequencyNorm.get(n) ?? 0.5));
  factors.push({ key: "historicalFrequency", value: histFreq, weight: ctx.factorWeights.historicalFrequency, contribution: 0, note: "Long-window frequency fit" });

  const recentFreq = avg(nums.map(n => ctx.recentFrequencyNorm.get(n) ?? 0.5));
  factors.push({ key: "recentFrequency", value: recentFreq, weight: ctx.factorWeights.recentFrequency, contribution: 0, note: "Recent-window frequency fit" });

  const overdue = avg(nums.map(n => 1 - (ctx.overdueNorm.get(n) ?? 0.5)));
  factors.push({ key: "overdueBalance", value: overdue, weight: ctx.factorWeights.overdueBalance, contribution: 0, note: "Overdue moderation" });

  const hot = nums.filter(n => (ctx.recentFrequencyNorm.get(n) ?? 0.5) > 0.7).length;
  const cold = nums.filter(n => (ctx.recentFrequencyNorm.get(n) ?? 0.5) < 0.3).length;
  const hotColdBalance = 1 - Math.abs(hot - cold) / numCount;
  factors.push({ key: "hotColdBalance", value: clamp(hotColdBalance), weight: ctx.factorWeights.hotColdBalance, contribution: 0, note: "Hot/cold mix balance" });

  const odd = nums.filter(n => n % 2 === 1).length;
  const oddEven = 1 - Math.abs(odd - numCount / 2) / (numCount / 2);
  factors.push({ key: "oddEvenBalance", value: clamp(oddEven), weight: ctx.factorWeights.oddEvenBalance, contribution: 0, note: "Odd/even balance" });

  const high = nums.filter(n => n > cfg.mainMax / 2).length;
  const highLow = 1 - Math.abs(high - numCount / 2) / (numCount / 2);
  factors.push({ key: "highLowBalance", value: clamp(highLow), weight: ctx.factorWeights.highLowBalance, contribution: 0, note: "High/low balance" });

  const sum = nums.reduce((a, b) => a + b, 0);
  const sumDistance = Math.abs(sum - ctx.sumStats.mean) / Math.max(ctx.sumStats.stdDev, 1);
  const sumRange = clamp(1 - sumDistance / 2);
  factors.push({ key: "sumRange", value: sumRange, weight: ctx.factorWeights.sumRange, contribution: 0, note: "Sum distance from historical center" });

  const spread = nums[nums.length - 1] - nums[0];
  const spreadDistance = Math.abs(spread - ctx.spreadStats.mean) / Math.max(ctx.spreadStats.stdDev, 1);
  const spreadScore = clamp(1 - spreadDistance / 2);
  factors.push({ key: "spread", value: spreadScore, weight: ctx.factorWeights.spread, contribution: 0, note: "Range spread vs baseline" });

  const clusteringPenalty = nums.slice(1).filter((n, i) => n - nums[i] <= 1).length / Math.max(numCount - 1, 1);
  const clusteringAvoidance = clamp(1 - clusteringPenalty);
  factors.push({ key: "clusteringAvoidance", value: clusteringAvoidance, weight: ctx.factorWeights.clusteringAvoidance, contribution: 0, note: "Avoid excessive adjacency" });

  let repeatedPairsCount = 0;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (ctx.topPairs.has(pairKey(nums[i], nums[j]))) repeatedPairsCount++;
    }
  }
  const maxPairs = (numCount * (numCount - 1)) / 2;
  const repeatedPairs = clamp(repeatedPairsCount / Math.max(1, maxPairs));
  factors.push({ key: "repeatedPairs", value: repeatedPairs, weight: ctx.factorWeights.repeatedPairs, contribution: 0, note: "Frequent pair participation" });

  let repeatedTriples = 0;
  for (let i = 0; i < nums.length - 2; i++) {
    if (ctx.topTriples.has(tripleKey([nums[i], nums[i + 1], nums[i + 2]]))) repeatedTriples++;
  }
  const tripleScore = clamp(repeatedTriples / Math.max(1, nums.length - 2));
  factors.push({ key: "repeatedTriples", value: tripleScore, weight: ctx.factorWeights.repeatedTriples, contribution: 0, note: "Frequent triple participation" });

  const modelPerformance = clamp(modelWeight);
  factors.push({ key: "modelPerformance", value: modelPerformance, weight: ctx.factorWeights.modelPerformance, contribution: 0, note: "Model historical hit-rate weight" });

  let score01 = 0;
  for (const factor of factors) {
    factor.contribution = factor.value * factor.weight;
    score01 += factor.contribution;
  }

  score01 = clamp(score01 * (0.85 + pred.confidenceScore * 0.15));
  const aiScore = Math.round(score01 * 100);
  const confidenceLabel: ConfidenceLabel = aiScore >= 75 ? "high" : aiScore >= 50 ? "medium" : "low";
  const riskSeed = 1 - score01;
  const riskLevel: RiskLevel = riskSeed > 0.6 || ctx.volatility > 0.7 ? "high" : riskSeed > 0.35 ? "medium" : "low";

  const topFactors = [...factors].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
  const summary = `Score ${aiScore}/100 from ${ctx.drawCount} draws; strongest signals: ${topFactors.map(f => f.note).join(", ")}.`;

  return {
    aiScore,
    confidenceLabel,
    explanationSummary: summary,
    supportingFactors: factors,
    riskLevel,
    modelAgreement,
    historicalSignals: {
      drawCount: ctx.drawCount,
      volatility: ctx.volatility,
      avgSum: ctx.sumStats.mean,
      avgSpread: ctx.spreadStats.mean,
    },
    generatedAt,
    correlationId,
    llm: {
      attempted: false,
      used: false,
      fallbackReason: "Deterministic scoring is source of truth; LLM enhancement disabled by default.",
    },
    factorSnapshot: Object.fromEntries(factors.map(f => [f.key, Number(f.value.toFixed(4))])),
  };
}

export function scorePredictionsExplainably(input: {
  cfg: GameConfig;
  history: HistoryDraw[];
  predictions: PredictionResult[];
  modelWeights?: Record<string, number>;
  learningFactorWeights?: Record<string, number>;
  correlationId?: string;
  generatedAt?: Date;
}) {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const ctx = buildScoringContext(input.cfg, input.history, input.learningFactorWeights);

  const numberVotes = new Map<number, number>();
  for (const pred of input.predictions) {
    for (const n of pred.mainNumbers) numberVotes.set(n, (numberVotes.get(n) || 0) + 1);
  }

  return input.predictions.map(pred => {
    const modelAgreement = pred.mainNumbers.length === 0
      ? 0
      : Number((pred.mainNumbers.reduce((acc, n) => acc + (numberVotes.get(n) || 0), 0) / (pred.mainNumbers.length * Math.max(input.predictions.length, 1))).toFixed(3));

    const explainable = scoreOne(
      input.cfg,
      pred,
      ctx,
      generatedAt,
      input.modelWeights?.[pred.modelName] ?? 0.5,
      modelAgreement,
      input.correlationId,
    );

    return {
      ...pred,
      metadata: {
        ...(pred.metadata || {}),
        explainable,
      },
    };
  });
}

export function deriveLearningFactorWeights(events: Array<{ payload: unknown }>): Record<string, number> {
  const aggregate: Record<string, { total: number; count: number }> = {};
  for (const event of events) {
    const payload = (event.payload || {}) as {
      game?: string;
      factor_snapshot?: Record<string, number>;
      match_ratio?: number;
    };
    if (!payload.factor_snapshot || typeof payload.match_ratio !== "number") continue;
    for (const [key, value] of Object.entries(payload.factor_snapshot)) {
      if (typeof value !== "number") continue;
      if (!aggregate[key]) aggregate[key] = { total: 0, count: 0 };
      aggregate[key].total += value * payload.match_ratio;
      aggregate[key].count += 1;
    }
  }

  const learned: Record<string, number> = {};
  for (const [key, base] of Object.entries(BASE_FACTOR_WEIGHTS)) {
    const row = aggregate[key];
    if (!row || row.count < 3) {
      learned[key] = 1;
      continue;
    }
    const avg = row.total / row.count; // 0..1
    const damped = 1 + (avg - 0.5) * 0.3; // gradual shift
    learned[key] = clamp(damped, 0.85, 1.15);
    if (!Number.isFinite(base)) learned[key] = 1;
  }
  return learned;
}

export function deriveLearningWeightsFromMetrics(
  metrics: Array<{
    metricName: string;
    sampleCount: number;
    weightedScore: number;
  }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of metrics) {
    const sampleDamp = clamp((row.sampleCount || 0) / 40, 0, 1);
    const centered = (row.weightedScore || 0) - 0.5;
    const shift = centered * 0.35 * sampleDamp;
    out[row.metricName] = clamp(1 + shift, 0.85, 1.15);
  }
  return out;
}
