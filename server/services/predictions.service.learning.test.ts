import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getDrawResults: vi.fn(),
  insertPredictions: vi.fn(),
  getModelWeights: vi.fn(),
  getRecentPredictionLearningEvents: vi.fn(),
  getPredictionLearningMetrics: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

import { generatePredictions } from "./predictions.service";
import { deriveLearningWeightsFromMetrics } from "./predictionIntelligence.service";

describe("prediction learning integration", () => {
  beforeEach(() => {
    dbMocks.getDrawResults.mockResolvedValue(Array.from({ length: 40 }, (_, i) => ({
      mainNumbers: [1 + (i % 30), 2 + (i % 30), 3 + (i % 30), 4 + (i % 30), 5 + (i % 30)],
      specialNumbers: [],
      drawDate: Date.now() - i * 86400000,
    })));
    dbMocks.getModelWeights.mockResolvedValue({ frequency_baseline: 0.6, gap_analysis: 0.5 });
    dbMocks.insertPredictions.mockResolvedValue(undefined);
    dbMocks.getRecentPredictionLearningEvents.mockResolvedValue([]);
    dbMocks.getPredictionLearningMetrics.mockImplementation(async (_game: string, type: "factor" | "model") => {
      if (type === "factor") {
        return [{ metricName: "historicalFrequency", sampleCount: 45, weightedScore: 0.72 }];
      }
      return [{ metricName: "frequency_baseline", sampleCount: 45, weightedScore: 0.7 }];
    });
  });

  it("prefers table-backed learning metrics when present", async () => {
    const result = await generatePredictions("fantasy_5", false, 7, "prediction:fantasy_5:7:111");

    expect(result.tableLearningUsed).toBe(true);
    expect(result.learningFactorWeights.historicalFrequency).toBeGreaterThan(1);
    expect(result.predictions.length).toBeGreaterThan(0);
    expect((result.predictions[0].metadata as any).explainable.correlationId).toBe("prediction:fantasy_5:7:111");
  });

  it("falls back to event payload learning when table is empty", async () => {
    dbMocks.getPredictionLearningMetrics.mockResolvedValue([]);
    dbMocks.getRecentPredictionLearningEvents.mockResolvedValue([
      { payload: { game: "fantasy_5", match_ratio: 0.8, factor_snapshot: { historicalFrequency: 0.9 } } },
      { payload: { game: "fantasy_5", match_ratio: 0.8, factor_snapshot: { historicalFrequency: 0.9 } } },
      { payload: { game: "fantasy_5", match_ratio: 0.8, factor_snapshot: { historicalFrequency: 0.9 } } },
    ]);

    const result = await generatePredictions("fantasy_5", false);

    expect(result.tableLearningUsed).toBe(false);
    expect(result.learningFactorWeights.historicalFrequency).toBeGreaterThan(1);
  });

  it("prediction generation still works with no learning rows", async () => {
    dbMocks.getPredictionLearningMetrics.mockResolvedValue([]);
    dbMocks.getRecentPredictionLearningEvents.mockResolvedValue([]);

    const result = await generatePredictions("fantasy_5", true);

    expect(result.predictions.length).toBe(18);
    expect(result.sumRangeFilterApplied).toBe(true);
  });
});

describe("bounded metric damping", () => {
  it("small samples do not create extreme weight shifts", () => {
    const weights = deriveLearningWeightsFromMetrics([
      { metricName: "historicalFrequency", sampleCount: 1, weightedScore: 1 },
      { metricName: "sumRange", sampleCount: 1, weightedScore: 0 },
    ]);

    expect(weights.historicalFrequency).toBeLessThan(1.02);
    expect(weights.sumRange).toBeGreaterThan(0.98);
    expect(weights.historicalFrequency).toBeLessThanOrEqual(1.15);
    expect(weights.sumRange).toBeGreaterThanOrEqual(0.85);
  });
});
