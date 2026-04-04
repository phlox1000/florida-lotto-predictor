import { describe, expect, it, vi } from "vitest";
import { scorePlayTonightTickets, SCORING_WEIGHTS, type ScoringBreakdown } from "./play-tonight";
import type { GameConfig, PredictionResult } from "../shared/lottery";
import { FLORIDA_GAMES } from "../shared/lottery";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function makePrediction(
  modelName: string,
  mainNumbers: number[],
  confidence: number
): PredictionResult {
  return {
    modelName,
    mainNumbers,
    specialNumbers: [],
    confidenceScore: confidence,
    metadata: {},
  };
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────

describe("Play Tonight Scoring", () => {
  const cfg = FLORIDA_GAMES.fantasy_5;
  const history = [
    { mainNumbers: [1, 5, 10, 20, 30] },
    { mainNumbers: [2, 8, 15, 25, 33] },
    { mainNumbers: [3, 7, 12, 22, 31] },
    { mainNumbers: [4, 9, 14, 24, 35] },
    { mainNumbers: [6, 11, 16, 26, 36] },
    { mainNumbers: [1, 3, 9, 18, 28] },
  ];

  const predictions: PredictionResult[] = [
    makePrediction("frequency_baseline", [1, 5, 10, 20, 30], 0.8),
    makePrediction("poisson_standard", [1, 5, 10, 20, 30], 0.7),
    makePrediction("hot_cold_70", [2, 8, 15, 25, 33], 0.6),
    makePrediction("gap_analysis", [3, 7, 12, 22, 31], 0.65),
  ];

  const modelWeights: Record<string, number> = {
    frequency_baseline: 0.9,
    poisson_standard: 0.7,
    hot_cold_70: 0.5,
    gap_analysis: 0.6,
  };

  it("weights sum to 1.0", () => {
    const total =
      SCORING_WEIGHTS.confidenceScore +
      SCORING_WEIGHTS.modelUsefulness +
      SCORING_WEIGHTS.consensusSupport +
      SCORING_WEIGHTS.patternScore +
      SCORING_WEIGHTS.personalScore;
    expect(total).toBeCloseTo(1.0, 10);
  });

  it("returns scoringBreakdown for each ticket", () => {
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
      { mainNumbers: [2, 8, 15, 25, 33], specialNumbers: [], modelSource: "hot_cold_70", confidence: 0.6 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);

    expect(scored).toHaveLength(2);
    for (const t of scored) {
      expect(t).toHaveProperty("scoringBreakdown");
      const bd = t.scoringBreakdown;
      expect(bd).toHaveProperty("confidenceScore");
      expect(bd).toHaveProperty("modelUsefulness");
      expect(bd).toHaveProperty("consensusSupport");
      expect(bd).toHaveProperty("patternScore");
      expect(bd).toHaveProperty("personalScore");
      expect(bd).toHaveProperty("finalScore");

      // Each component has value, weight, and weighted
      for (const key of ["confidenceScore", "modelUsefulness", "consensusSupport", "patternScore", "personalScore"] as const) {
        expect(bd[key]).toHaveProperty("value");
        expect(bd[key]).toHaveProperty("weight");
        expect(bd[key]).toHaveProperty("weighted");
        expect(typeof bd[key].value).toBe("number");
        expect(typeof bd[key].weight).toBe("number");
        expect(typeof bd[key].weighted).toBe("number");
      }

      // finalScore should be the sum of all weighted components
      const expectedFinal =
        bd.confidenceScore.weighted +
        bd.modelUsefulness.weighted +
        bd.consensusSupport.weighted +
        bd.patternScore.weighted +
        bd.personalScore.weighted;
      expect(bd.finalScore).toBeCloseTo(expectedFinal, 3);
    }
  });

  it("uses correct coefficient weights", () => {
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);
    const bd = scored[0].scoringBreakdown;

    expect(bd.confidenceScore.weight).toBe(0.35);
    expect(bd.modelUsefulness.weight).toBe(0.30);
    expect(bd.consensusSupport.weight).toBe(0.20);
    expect(bd.patternScore.weight).toBe(0.10);
    expect(bd.personalScore.weight).toBe(0.05);
  });

  it("confidenceScore component reflects the model confidence", () => {
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);
    expect(scored[0].scoringBreakdown.confidenceScore.value).toBe(0.8);
  });

  it("modelUsefulness component reflects the model weight", () => {
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);
    expect(scored[0].scoringBreakdown.modelUsefulness.value).toBe(0.9);
  });

  it("consensusSupport is higher when more models agree on the numbers", () => {
    // [1,5,10,20,30] appears in 2 of 4 predictions (frequency_baseline + poisson_standard)
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
      { mainNumbers: [99, 98, 97, 96, 95], specialNumbers: [], modelSource: "unknown", confidence: 0.5 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);
    // The first ticket should have higher consensus than the second (which has no overlap)
    expect(scored[0].scoringBreakdown.consensusSupport.value).toBeGreaterThan(
      scored[1].scoringBreakdown.consensusSupport.value
    );
  });

  it("personalScore defaults to 0.5 when no personal metrics provided", () => {
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);
    expect(scored[0].scoringBreakdown.personalScore.value).toBe(0.5);
  });

  it("finalScore is between 0 and 1", () => {
    const tickets = [
      { mainNumbers: [1, 5, 10, 20, 30], specialNumbers: [], modelSource: "frequency_baseline", confidence: 0.8 },
      { mainNumbers: [2, 8, 15, 25, 33], specialNumbers: [], modelSource: "hot_cold_70", confidence: 0.6 },
    ];

    const scored = scorePlayTonightTickets(tickets, predictions, modelWeights, cfg, history);
    for (const t of scored) {
      expect(t.scoringBreakdown.finalScore).toBeGreaterThanOrEqual(0);
      expect(t.scoringBreakdown.finalScore).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Integration: tickets.generate returns scoringBreakdown ─────────────────

describe("tickets.generate includes scoringBreakdown", () => {
  it("returns scoringBreakdown in each ticket from the API", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.tickets.generate({
      gameType: "fantasy_5",
      budget: 10,
      maxTickets: 5,
    });

    expect(result).toHaveProperty("tickets");
    expect(result.tickets.length).toBeGreaterThan(0);

    for (const ticket of result.tickets) {
      expect(ticket).toHaveProperty("scoringBreakdown");
      expect(ticket.scoringBreakdown).toHaveProperty("finalScore");
      expect(ticket.scoringBreakdown).toHaveProperty("confidenceScore");
      expect(ticket.scoringBreakdown).toHaveProperty("modelUsefulness");
      expect(ticket.scoringBreakdown).toHaveProperty("consensusSupport");
      expect(ticket.scoringBreakdown).toHaveProperty("patternScore");
      expect(ticket.scoringBreakdown).toHaveProperty("personalScore");
      expect(typeof ticket.scoringBreakdown.finalScore).toBe("number");
    }
  });
});
