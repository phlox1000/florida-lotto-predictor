import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { getDrawResults, getPredictionLearningMetrics, getRecentPredictionLearningEvents } from "../db";
import { runAllModels } from "../predictions";
import {
  deriveLearningFactorWeights,
  deriveLearningWeightsFromMetrics,
  scorePredictionsExplainably,
} from "./predictionIntelligence.service";

export async function getLearningStatusByGame(gameType: GameType, userId?: number, windowDays = 90) {
  const [factorMetrics, modelMetrics, fallbackEvents] = await Promise.all([
    getPredictionLearningMetrics(gameType, "factor", windowDays),
    getPredictionLearningMetrics(gameType, "model", windowDays),
    getRecentPredictionLearningEvents(gameType, userId, 200),
  ]);

  const tableLearningUsed = factorMetrics.length > 0 || modelMetrics.length > 0;
  const fallbackLearningUsed = !tableLearningUsed && fallbackEvents.length > 0;

  const topPositiveFactors = [...factorMetrics]
    .sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0))
    .slice(0, 5)
    .map(row => ({
      factorName: row.metricName,
      weightedScore: row.weightedScore ?? 0,
      sampleCount: row.sampleCount ?? 0,
      averageMatchRatio: row.averageMatchRatio ?? 0,
    }));

  const topNegativeFactors = [...factorMetrics]
    .sort((a, b) => (a.weightedScore ?? 0) - (b.weightedScore ?? 0))
    .slice(0, 5)
    .map(row => ({
      factorName: row.metricName,
      weightedScore: row.weightedScore ?? 0,
      sampleCount: row.sampleCount ?? 0,
      averageMatchRatio: row.averageMatchRatio ?? 0,
    }));

  const topModels = [...modelMetrics]
    .sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0))
    .slice(0, 5)
    .map(row => ({
      modelName: row.metricName,
      weightedScore: row.weightedScore ?? 0,
      sampleCount: row.sampleCount ?? 0,
      averageMatchRatio: row.averageMatchRatio ?? 0,
    }));

  const allRows = [...factorMetrics, ...modelMetrics];
  const lastUpdatedAt = allRows.reduce<Date | null>((latest, row) => {
    const candidate = row.lastUpdatedAt ? new Date(row.lastUpdatedAt) : null;
    if (!candidate) return latest;
    if (!latest || candidate > latest) return candidate;
    return latest;
  }, null);

  return {
    gameType,
    tableLearningUsed,
    fallbackLearningUsed,
    factorMetricsCount: factorMetrics.length,
    modelMetricsCount: modelMetrics.length,
    windowDays,
    sampleCounts: {
      factor: factorMetrics.reduce((acc, row) => acc + (row.sampleCount ?? 0), 0),
      model: modelMetrics.reduce((acc, row) => acc + (row.sampleCount ?? 0), 0),
      fallbackEvents: fallbackEvents.length,
    },
    topPositiveFactors,
    topNegativeFactors,
    topModels,
    lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
  };
}

export async function runLearningBacktestComparison(input: {
  gameType: GameType;
  lookbackDraws?: number;
  windowDays?: number;
  userId?: number;
}) {
  const cfg = FLORIDA_GAMES[input.gameType];
  const lookbackDraws = Math.min(Math.max(input.lookbackDraws ?? 20, 5), 60);
  const historyRows = await getDrawResults(input.gameType, 260);
  const chronological = [...historyRows].reverse().map(r => ({
    mainNumbers: r.mainNumbers as number[],
    specialNumbers: (r.specialNumbers as number[]) || [],
    drawDate: r.drawDate,
  }));

  const [factorMetrics, modelMetrics, events] = await Promise.all([
    getPredictionLearningMetrics(input.gameType, "factor", input.windowDays ?? 90),
    getPredictionLearningMetrics(input.gameType, "model", input.windowDays ?? 90),
    getRecentPredictionLearningEvents(input.gameType, input.userId, 500),
  ]);

  const tableFactorWeights = deriveLearningWeightsFromMetrics(
    factorMetrics.map(r => ({ metricName: r.metricName, sampleCount: r.sampleCount ?? 0, weightedScore: r.weightedScore ?? 0 })),
  );
  const tableModelWeights = deriveLearningWeightsFromMetrics(
    modelMetrics.map(r => ({ metricName: r.metricName, sampleCount: r.sampleCount ?? 0, weightedScore: r.weightedScore ?? 0 })),
  );
  const fallbackFactorWeights = deriveLearningFactorWeights(events);

  const results: Record<string, { totalRatio: number; count: number }> = {
    baseline: { totalRatio: 0, count: 0 },
    eventFallback: { totalRatio: 0, count: 0 },
    tableBacked: { totalRatio: 0, count: 0 },
  };

  const startIdx = Math.max(20, chronological.length - lookbackDraws);
  for (let idx = startIdx; idx < chronological.length; idx++) {
    const train = chronological.slice(0, idx);
    const actual = chronological[idx];
    if (train.length < 20 || !actual) continue;

    const evaluateScenario = (
      scenario: keyof typeof results,
      factorWeights?: Record<string, number>,
      modelWeights?: Record<string, number>,
    ) => {
      const predictions = runAllModels(cfg, train, modelWeights);
      const scored = scorePredictionsExplainably({
        cfg,
        history: train,
        predictions,
        learningFactorWeights: factorWeights,
        modelWeights: modelWeights ?? {},
      });
      const best = [...scored].sort((a, b) => ((b.metadata as any).explainable.aiScore ?? 0) - ((a.metadata as any).explainable.aiScore ?? 0))[0];
      const match = best.mainNumbers.filter(n => actual.mainNumbers.includes(n)).length;
      results[scenario].totalRatio += best.mainNumbers.length > 0 ? match / best.mainNumbers.length : 0;
      results[scenario].count += 1;
    };

    evaluateScenario("baseline");
    evaluateScenario("eventFallback", fallbackFactorWeights);
    evaluateScenario("tableBacked", tableFactorWeights, tableModelWeights);
  }

  const summarize = (key: keyof typeof results) => {
    const row = results[key];
    return {
      mode: key,
      samples: row.count,
      averageMatchRatio: row.count > 0 ? Number((row.totalRatio / row.count).toFixed(4)) : 0,
    };
  };

  return {
    gameType: input.gameType,
    lookbackDraws,
    windowDays: input.windowDays ?? 90,
    scenarios: [summarize("baseline"), summarize("eventFallback"), summarize("tableBacked")],
  };
}
