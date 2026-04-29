import { describe, expect, it } from "vitest";
import { FLORIDA_GAMES } from "../shared/lottery";
import {
  deriveLearningFactorWeights,
  scorePredictionsExplainably,
} from "./services/predictionIntelligence.service";

const cfg = FLORIDA_GAMES.fantasy_5;

function history(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    mainNumbers: [
      ((i * 3) % cfg.mainMax) + 1,
      ((i * 5 + 7) % cfg.mainMax) + 1,
      ((i * 7 + 11) % cfg.mainMax) + 1,
      ((i * 11 + 13) % cfg.mainMax) + 1,
      ((i * 13 + 17) % cfg.mainMax) + 1,
    ].sort((a, b) => a - b),
    specialNumbers: [],
    drawDate: Date.now() - i * 86400000,
  }));
}

describe("prediction intelligence scoring", () => {
  it("returns explainable metadata shape and deterministic scores", () => {
    const predictions = [
      { modelName: "frequency_baseline", mainNumbers: [2, 7, 14, 21, 29], specialNumbers: [], confidenceScore: 0.72, metadata: {} },
      { modelName: "gap_analysis", mainNumbers: [3, 9, 18, 26, 34], specialNumbers: [], confidenceScore: 0.61, metadata: {} },
    ];

    const run1 = scorePredictionsExplainably({
      cfg,
      history: history(120),
      predictions,
      modelWeights: { frequency_baseline: 0.7, gap_analysis: 0.5 },
      generatedAt: new Date("2026-04-28T00:00:00.000Z"),
      correlationId: "prediction:fantasy_5:1:100",
    });

    const run2 = scorePredictionsExplainably({
      cfg,
      history: history(120),
      predictions,
      modelWeights: { frequency_baseline: 0.7, gap_analysis: 0.5 },
      generatedAt: new Date("2026-04-28T00:00:00.000Z"),
      correlationId: "prediction:fantasy_5:1:100",
    });

    expect(run1[0].metadata).toHaveProperty("explainable");
    const explainable = (run1[0].metadata as any).explainable;
    expect(explainable.aiScore).toBeGreaterThanOrEqual(0);
    expect(explainable.aiScore).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high"]).toContain(explainable.confidenceLabel);
    expect(["low", "medium", "high"]).toContain(explainable.riskLevel);
    expect(Array.isArray(explainable.supportingFactors)).toBe(true);
    expect(explainable.generatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(explainable.correlationId).toBe("prediction:fantasy_5:1:100");

    expect((run1[0].metadata as any).explainable.aiScore).toBe((run2[0].metadata as any).explainable.aiScore);
    expect((run1[0].metadata as any).explainable.explanationSummary).toBe((run2[0].metadata as any).explainable.explanationSummary);
  });

  it("handles limited history without crashing", () => {
    const result = scorePredictionsExplainably({
      cfg,
      history: [],
      predictions: [
        { modelName: "frequency_baseline", mainNumbers: [1, 5, 10, 15, 20], specialNumbers: [], confidenceScore: 0.5, metadata: {} },
      ],
    });

    expect(result).toHaveLength(1);
    expect((result[0].metadata as any).explainable.aiScore).toBeGreaterThanOrEqual(0);
    expect((result[0].metadata as any).explainable.llm.used).toBe(false);
    expect((result[0].metadata as any).explainable.llm.fallbackReason).toContain("Deterministic");
  });
});

describe("learning factor adaptation", () => {
  it("returns safe defaults when events are missing", () => {
    const weights = deriveLearningFactorWeights([]);
    expect(Object.values(weights).every(v => v === 1)).toBe(true);
  });

  it("adjusts weights gradually from prediction accuracy events", () => {
    const events = [
      { payload: { game: "fantasy_5", match_ratio: 0.8, factor_snapshot: { historicalFrequency: 0.9, sumRange: 0.8 } } },
      { payload: { game: "fantasy_5", match_ratio: 0.75, factor_snapshot: { historicalFrequency: 0.85, sumRange: 0.82 } } },
      { payload: { game: "fantasy_5", match_ratio: 0.7, factor_snapshot: { historicalFrequency: 0.87, sumRange: 0.79 } } },
    ];

    const weights = deriveLearningFactorWeights(events);
    expect(weights.historicalFrequency).toBeGreaterThan(1);
    expect(weights.historicalFrequency).toBeLessThanOrEqual(1.15);
    expect(weights.sumRange).toBeGreaterThan(1);
  });
});
