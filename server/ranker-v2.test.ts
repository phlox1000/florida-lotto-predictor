import { describe, expect, it } from "vitest";
import { FLORIDA_GAMES, type GameConfig, type PredictionResult } from "../shared/lottery";
import {
  computeCandidateFeatures,
  diversifyRankedCandidates,
  rankCandidates,
  trainOnlineLogisticRegression,
  getDefaultRankerState,
  computeRewardScore,
} from "./ranker-v2";

function mockHistory(cfg: GameConfig, count: number) {
  const history: Array<{ mainNumbers: number[]; specialNumbers: number[]; drawDate: number }> = [];
  for (let i = 0; i < count; i++) {
    const used = new Set<number>();
    const mainNumbers: number[] = [];
    let seed = i * 17 + 11;
    while (mainNumbers.length < cfg.mainCount) {
      seed = (seed * 31 + 7) % 100000;
      const n = (seed % cfg.mainMax) + 1;
      if (!used.has(n)) {
        used.add(n);
        mainNumbers.push(n);
      }
    }
    history.push({
      mainNumbers: mainNumbers.sort((a, b) => a - b),
      specialNumbers: [],
      drawDate: Date.now() - (count - i) * 86_400_000,
    });
  }
  return history;
}

describe("ranker-v2", () => {
  it("computes features and deterministic ranking for model candidates", () => {
    const cfg = FLORIDA_GAMES.fantasy_5;
    const history = mockHistory(cfg, 50);
    const predictions: PredictionResult[] = [
      {
        modelName: "model_a",
        mainNumbers: [1, 2, 3, 4, 5],
        specialNumbers: [],
        confidenceScore: 0.82,
        metadata: { strategy: "test" },
      },
      {
        modelName: "model_b",
        mainNumbers: [1, 2, 6, 7, 8],
        specialNumbers: [],
        confidenceScore: 0.65,
        metadata: { strategy: "test" },
      },
      {
        modelName: "model_c",
        mainNumbers: [9, 10, 11, 12, 13],
        specialNumbers: [],
        confidenceScore: 0.55,
        metadata: { strategy: "test" },
      },
    ];
    const features = computeCandidateFeatures(
      cfg,
      history,
      predictions,
      { model_a: 0.8, model_b: 0.6, model_c: 0.5 },
      { model_a: 1.9, model_b: 1.4, model_c: 1.2 },
    );
    expect(features).toHaveLength(3);
    expect(features[0].features).toHaveProperty("base_confidence");
    expect(features[0].features).toHaveProperty("consensus_overlap");

    const ranked = rankCandidates(features, getDefaultRankerState(cfg.id));
    expect(ranked).toHaveLength(3);
    expect(ranked[0].rankPosition).toBe(1);
    expect(ranked[0].rankerProbability).toBeGreaterThanOrEqual(ranked[1].rankerProbability);
    expect(ranked[1].rankerProbability).toBeGreaterThanOrEqual(ranked[2].rankerProbability);
  });

  it("diversifies near-duplicate candidates", () => {
    const cfg = FLORIDA_GAMES.fantasy_5;
    const history = mockHistory(cfg, 40);
    const predictions: PredictionResult[] = [
      {
        modelName: "model_a",
        mainNumbers: [1, 2, 3, 4, 5],
        specialNumbers: [],
        confidenceScore: 0.9,
        metadata: {},
      },
      {
        modelName: "model_b",
        mainNumbers: [1, 2, 3, 4, 6],
        specialNumbers: [],
        confidenceScore: 0.89,
        metadata: {},
      },
      {
        modelName: "model_c",
        mainNumbers: [7, 8, 9, 10, 11],
        specialNumbers: [],
        confidenceScore: 0.6,
        metadata: {},
      },
    ];
    const features = computeCandidateFeatures(cfg, history, predictions, {}, {});
    const ranked = rankCandidates(features, getDefaultRankerState(cfg.id));
    const selected = diversifyRankedCandidates(ranked, cfg, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].selectedForFinal).toBe(true);
    expect(selected[1].selectedForFinal).toBe(true);
    const overlap = selected[0].mainNumbers.filter(n => selected[1].mainNumbers.includes(n)).length;
    expect(overlap).toBeLessThanOrEqual(cfg.mainCount - 2);
  });

  it("updates logistic coefficients from rewarded examples", () => {
    const state = getDefaultRankerState("fantasy_5");
    const next = trainOnlineLogisticRegression(state, [
      { features: { base_confidence: 0.9, consensus_overlap: 0.8 }, rewardScore: 0.9 },
      { features: { base_confidence: 0.2, consensus_overlap: 0.1 }, rewardScore: 0.1 },
    ]);
    expect(next.trainedExamples).toBe(state.trainedExamples + 2);
    expect(next.intercept).not.toBe(state.intercept);
    expect(next.coefficients.base_confidence).not.toBe(state.coefficients.base_confidence);
  });

  it("computes monotonic reward scores for partial vs full hits", () => {
    const cfg = FLORIDA_GAMES.powerball;
    const miss = computeRewardScore(cfg, 0, 0);
    const partial = computeRewardScore(cfg, 3, 0);
    const strong = computeRewardScore(cfg, 5, 0);
    const jackpot = computeRewardScore(cfg, 5, 1);
    expect(miss).toBeGreaterThanOrEqual(0);
    expect(partial).toBeGreaterThan(miss);
    expect(strong).toBeGreaterThan(partial);
    expect(jackpot).toBeGreaterThanOrEqual(strong);
    expect(jackpot).toBeLessThanOrEqual(1);
  });
});
