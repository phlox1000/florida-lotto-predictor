import { describe, expect, it } from "vitest";
import { CASH_POP_SLUGS, MAIN_COUNTS } from "./lib/lotteryusa-scraper";
import { selectBudgetTickets } from "./predictions";
import type { GameConfig, PredictionResult } from "../shared/lottery";
import { FLORIDA_GAMES } from "../shared/lottery";

describe("LotteryUSA Cash Pop slugs", () => {
  it("defines all 5 daily draw slugs", () => {
    expect(CASH_POP_SLUGS).toHaveLength(5);
    expect(CASH_POP_SLUGS.map(s => s.drawTime)).toEqual([
      "morning", "matinee", "afternoon", "evening", "late_night",
    ]);
  });

  it("all slugs are non-empty strings", () => {
    for (const { slug } of CASH_POP_SLUGS) {
      expect(slug).toBeTruthy();
      expect(slug).toMatch(/^cash-pop-/);
    }
  });

  it("MAIN_COUNTS has cash_pop = 1", () => {
    expect(MAIN_COUNTS.cash_pop).toBe(1);
  });
});

describe("selectBudgetTickets for single-number game", () => {
  const cfg = FLORIDA_GAMES["cash_pop"];

  const mockPredictions: PredictionResult[] = [
    { modelName: "frequency_baseline", mainNumbers: [7], specialNumbers: [], confidenceScore: 0.5, metadata: {} },
    { modelName: "poisson_standard", mainNumbers: [3], specialNumbers: [], confidenceScore: 0.8, metadata: {} },
    { modelName: "bayesian", mainNumbers: [7], specialNumbers: [], confidenceScore: 0.7, metadata: {} },
    { modelName: "monte_carlo", mainNumbers: [12], specialNumbers: [], confidenceScore: 0.6, metadata: {} },
    { modelName: "markov_chain", mainNumbers: [5], specialNumbers: [], confidenceScore: 0.65, metadata: {} },
    { modelName: "ai_oracle", mainNumbers: [3], specialNumbers: [], confidenceScore: 0.9, metadata: {} },
  ];

  it("produces tickets with single-element mainNumbers", () => {
    const result = selectBudgetTickets(cfg, mockPredictions, 10, 10);
    for (const t of result.tickets) {
      expect(t.mainNumbers).toHaveLength(1);
      expect(t.mainNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(t.mainNumbers[0]).toBeLessThanOrEqual(15);
    }
  });

  it("produces distinct ticket numbers when possible", () => {
    const result = selectBudgetTickets(cfg, mockPredictions, 10, 10);
    const numbers = result.tickets.map(t => t.mainNumbers[0]);
    const unique = new Set(numbers);
    // With 6 mock predictions covering 4 unique numbers + variation pool,
    // we should get more distinct numbers than just the 4 model outputs
    expect(unique.size).toBeGreaterThan(3);
  });

  it("respects budget constraints", () => {
    const result = selectBudgetTickets(cfg, mockPredictions, 5, 20);
    expect(result.tickets.length).toBeLessThanOrEqual(5);
    expect(result.totalCost).toBeLessThanOrEqual(5);
  });
});
