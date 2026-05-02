import { describe, expect, it } from "vitest";
import { buildLearningRollupsFromAccuracyPayloads } from "./db";

describe("learning rollup aggregation", () => {
  it("produces factor and model rollups from accuracy payloads", () => {
    const { factorAgg, modelAgg } = buildLearningRollupsFromAccuracyPayloads([
      {
        game: "fantasy_5",
        match_ratio: 0.6,
        factor_snapshot: { historicalFrequency: 0.8, sumRange: 0.7 },
        model_scores: { frequency_baseline: 0.6 },
      },
      {
        game: "fantasy_5",
        match_ratio: 0.8,
        factor_snapshot: { historicalFrequency: 0.9 },
        model_scores: { frequency_baseline: 0.8, gap_analysis: 0.4 },
      },
    ]);

    const factor = factorAgg.get("fantasy_5|historicalFrequency");
    const model = modelAgg.get("fantasy_5|frequency_baseline");
    expect(factor).toBeDefined();
    expect(model).toBeDefined();
    expect(factor!.count).toBe(2);
    expect(model!.count).toBe(2);
    expect(factor!.total).toBeCloseTo(0.8 * 0.6 + 0.9 * 0.8, 6);
    expect(modelAgg.get("fantasy_5|gap_analysis")!.count).toBe(1);
  });
});
