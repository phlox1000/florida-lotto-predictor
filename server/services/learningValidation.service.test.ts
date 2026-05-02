import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getDrawResults: vi.fn(),
  getPredictionLearningMetrics: vi.fn(),
  getRecentPredictionLearningEvents: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

import { getLearningStatusByGame, runLearningBacktestComparison } from "./learningValidation.service";

describe("learning validation status", () => {
  beforeEach(() => {
    dbMocks.getRecentPredictionLearningEvents.mockResolvedValue([]);
    dbMocks.getPredictionLearningMetrics.mockResolvedValue([]);
  });

  it("returns learning status with populated metric rows", async () => {
    dbMocks.getPredictionLearningMetrics.mockImplementation(async (_game: string, type: "factor" | "model") => {
      if (type === "factor") {
        return [
          { metricName: "historicalFrequency", weightedScore: 0.71, sampleCount: 42, averageMatchRatio: 0.61, lastUpdatedAt: new Date("2026-04-28T00:00:00.000Z") },
          { metricName: "overdueBalance", weightedScore: 0.35, sampleCount: 40, averageMatchRatio: 0.42, lastUpdatedAt: new Date("2026-04-28T00:00:00.000Z") },
        ];
      }
      return [
        { metricName: "ai_oracle", weightedScore: 0.77, sampleCount: 50, averageMatchRatio: 0.68, lastUpdatedAt: new Date("2026-04-28T00:00:00.000Z") },
      ];
    });

    const status = await getLearningStatusByGame("fantasy_5", 1, 90);
    expect(status.tableLearningUsed).toBe(true);
    expect(status.fallbackLearningUsed).toBe(false);
    expect(status.factorMetricsCount).toBe(2);
    expect(status.modelMetricsCount).toBe(1);
    expect(status.topPositiveFactors[0].factorName).toBe("historicalFrequency");
    expect(status.topNegativeFactors[0].factorName).toBe("overdueBalance");
    expect(status.topModels[0].modelName).toBe("ai_oracle");
  });

  it("returns safe empty status when no rows exist", async () => {
    const status = await getLearningStatusByGame("fantasy_5", 1, 90);
    expect(status.tableLearningUsed).toBe(false);
    expect(status.factorMetricsCount).toBe(0);
    expect(status.modelMetricsCount).toBe(0);
    expect(status.topPositiveFactors).toEqual([]);
    expect(status.topModels).toEqual([]);
  });
});

describe("learning backtest comparison", () => {
  it("produces deterministic comparison shape", async () => {
    dbMocks.getDrawResults.mockResolvedValue(Array.from({ length: 80 }, (_, i) => ({
      mainNumbers: [1 + (i % 25), 2 + (i % 25), 3 + (i % 25), 4 + (i % 25), 5 + (i % 25)],
      specialNumbers: [],
      drawDate: Date.now() - i * 86400000,
    })));
    dbMocks.getPredictionLearningMetrics.mockResolvedValue([]);
    dbMocks.getRecentPredictionLearningEvents.mockResolvedValue([]);

    const result = await runLearningBacktestComparison({ gameType: "fantasy_5", lookbackDraws: 10, windowDays: 90 });
    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios.map(s => s.mode)).toEqual(["baseline", "eventFallback", "tableBacked"]);
    for (const scenario of result.scenarios) {
      expect(scenario.samples).toBeGreaterThan(0);
      expect(scenario.averageMatchRatio).toBeGreaterThanOrEqual(0);
      expect(scenario.averageMatchRatio).toBeLessThanOrEqual(1);
    }
  });
});
