import { describe, expect, it } from "vitest";
import { runAllModels, selectBudgetTickets, weightedSampleWithoutReplacement } from "./predictions";
import { FLORIDA_GAMES, type GameConfig } from "../shared/lottery";

describe("Prediction Engine", () => {
  const fantasy5 = FLORIDA_GAMES.fantasy_5;
  const powerball = FLORIDA_GAMES.powerball;
  const pick3 = FLORIDA_GAMES.pick_3;

  // Generate mock history with deterministic data
  function mockHistory(cfg: GameConfig, count: number) {
    const history = [];
    for (let i = 0; i < count; i++) {
      const mainNumbers: number[] = [];
      const used = new Set<number>();
      let seed = i * 7 + 3;
      while (mainNumbers.length < cfg.mainCount) {
        seed = (seed * 31 + 17) % 10000;
        const n = cfg.isDigitGame
          ? seed % 10
          : (seed % cfg.mainMax) + 1;
        if (cfg.isDigitGame || !used.has(n)) {
          mainNumbers.push(n);
          used.add(n);
        }
      }
      const specialNumbers: number[] = [];
      for (let j = 0; j < cfg.specialCount; j++) {
        seed = (seed * 31 + 17) % 10000;
        specialNumbers.push((seed % cfg.specialMax) + 1);
      }
      history.push({
        mainNumbers: mainNumbers.sort((a, b) => a - b),
        specialNumbers: specialNumbers.sort((a, b) => a - b),
        drawDate: Date.now() - (count - i) * 86400000,
      });
    }
    return history;
  }

  describe("runAllModels", () => {
    it("returns exactly 18 predictions for Fantasy 5", () => {
      const history = mockHistory(fantasy5, 200);
      const results = runAllModels(fantasy5, history);
      expect(results).toHaveLength(18);
    });

    it("returns exactly 18 predictions for Powerball", () => {
      const history = mockHistory(powerball, 200);
      const results = runAllModels(powerball, history);
      expect(results).toHaveLength(18);
    });

    it("returns exactly 18 predictions for Pick 3 (digit game)", () => {
      const history = mockHistory(pick3, 200);
      const results = runAllModels(pick3, history);
      expect(results).toHaveLength(18);
    });

    it("returns 18 predictions even with empty history", () => {
      const results = runAllModels(fantasy5, []);
      expect(results).toHaveLength(18);
    });

    it("each prediction has correct number of main numbers OR is marked insufficient", () => {
      const history = mockHistory(fantasy5, 100);
      const results = runAllModels(fantasy5, history);
      for (const pred of results) {
        const meta = pred.metadata as Record<string, unknown>;
        if (meta?.insufficient_data === true) {
          expect(pred.mainNumbers).toHaveLength(0);
        } else {
          expect(pred.mainNumbers).toHaveLength(fantasy5.mainCount);
        }
      }
    });

    it("Powerball predictions have correct main and special counts OR are insufficient", () => {
      const history = mockHistory(powerball, 100);
      const results = runAllModels(powerball, history);
      for (const pred of results) {
        const meta = pred.metadata as Record<string, unknown>;
        if (meta?.insufficient_data === true) {
          expect(pred.mainNumbers).toHaveLength(0);
        } else {
          expect(pred.mainNumbers).toHaveLength(powerball.mainCount);
          expect(pred.specialNumbers).toHaveLength(powerball.specialCount);
        }
      }
    });

    it("main numbers are within valid range for Fantasy 5", () => {
      const history = mockHistory(fantasy5, 100);
      const results = runAllModels(fantasy5, history);
      for (const pred of results) {
        for (const n of pred.mainNumbers) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(fantasy5.mainMax);
        }
      }
    });

    it("special numbers are within valid range for Powerball", () => {
      const history = mockHistory(powerball, 100);
      const results = runAllModels(powerball, history);
      for (const pred of results) {
        for (const n of pred.specialNumbers) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(powerball.specialMax);
        }
      }
    });

    it("confidence scores are between 0 and 1", () => {
      const history = mockHistory(fantasy5, 100);
      const results = runAllModels(fantasy5, history);
      for (const pred of results) {
        expect(pred.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(pred.confidenceScore).toBeLessThanOrEqual(1);
      }
    });

    it("all 18 model names are present (frequency_baseline replaces random)", () => {
      const history = mockHistory(fantasy5, 200);
      const results = runAllModels(fantasy5, history);
      const names = results.map(r => r.modelName);
      expect(names).toContain("frequency_baseline");
      expect(names).toContain("poisson_standard");
      expect(names).toContain("poisson_short");
      expect(names).toContain("poisson_long");
      expect(names).toContain("hot_cold_70");
      expect(names).toContain("hot_cold_50");
      expect(names).toContain("balanced_hot_cold");
      expect(names).toContain("gap_analysis");
      expect(names).toContain("cooccurrence");
      expect(names).toContain("delta");
      expect(names).toContain("temporal_echo");
      expect(names).toContain("monte_carlo");
      expect(names).toContain("markov_chain");
      expect(names).toContain("bayesian");
      expect(names).toContain("quantum_entanglement");
      expect(names).toContain("cdm");
      expect(names).toContain("chi_square");
      expect(names).toContain("ai_oracle");
    });

    it("ai_oracle is the last model", () => {
      const history = mockHistory(fantasy5, 200);
      const results = runAllModels(fantasy5, history);
      expect(results[results.length - 1].modelName).toBe("ai_oracle");
    });

    it("frequency_baseline always produces results even with no history", () => {
      const results = runAllModels(fantasy5, []);
      const baseline = results.find(r => r.modelName === "frequency_baseline");
      expect(baseline).toBeDefined();
      expect(baseline!.mainNumbers).toHaveLength(fantasy5.mainCount);
    });
  });

  it("runAllModels produces stable output for identical inputs", () => {
    const cfg = FLORIDA_GAMES["fantasy_5"];
    const history = Array.from({ length: 50 }, (_, i) => ({
      mainNumbers: [1+i%5, 2+i%5, 3+i%5, 4+i%5, 5+i%5].map(n => 
        Math.min(n, cfg.mainMax)),
      specialNumbers: [],
      drawDate: Date.now() - i * 86400000,
    }));
    const result1 = runAllModels(cfg, history);
    const result2 = runAllModels(cfg, history);
    result1.forEach((pred, i) => {
      expect(pred.mainNumbers).toEqual(result2[i].mainNumbers);
    });
  });

  describe("selectBudgetTickets", () => {
    it("returns at most 20 tickets for Fantasy 5 with $75 budget", () => {
      const history = mockHistory(fantasy5, 100);
      const preds = runAllModels(fantasy5, history);
      const selection = selectBudgetTickets(fantasy5, preds, 75, 20);
      expect(selection.tickets.length).toBeLessThanOrEqual(20);
      expect(selection.tickets.length).toBeGreaterThan(0);
    });

    it("total cost does not exceed budget for Fantasy 5", () => {
      const history = mockHistory(fantasy5, 100);
      const preds = runAllModels(fantasy5, history);
      const selection = selectBudgetTickets(fantasy5, preds, 75, 20);
      expect(selection.totalCost).toBeLessThanOrEqual(75);
    });

    it("total cost does not exceed budget for Powerball ($2 tickets)", () => {
      const history = mockHistory(powerball, 100);
      const preds = runAllModels(powerball, history);
      const selection = selectBudgetTickets(powerball, preds, 75, 20);
      expect(selection.totalCost).toBeLessThanOrEqual(75);
      expect(selection.tickets.length).toBeLessThanOrEqual(20);
    });

    it("each ticket has correct number count", () => {
      const history = mockHistory(fantasy5, 100);
      const preds = runAllModels(fantasy5, history);
      const selection = selectBudgetTickets(fantasy5, preds, 75, 20);
      for (const ticket of selection.tickets) {
        expect(ticket.mainNumbers).toHaveLength(fantasy5.mainCount);
      }
    });

    it("each Powerball ticket has special number", () => {
      const history = mockHistory(powerball, 100);
      const preds = runAllModels(powerball, history);
      const selection = selectBudgetTickets(powerball, preds, 75, 20);
      for (const ticket of selection.tickets) {
        expect(ticket.specialNumbers).toHaveLength(powerball.specialCount);
      }
    });

    it("selectBudgetTickets grounds special numbers in history", () => {
      const cfg = FLORIDA_GAMES["powerball"];
      const history = Array.from({ length: 20 }, (_, i) => ({
        mainNumbers: [1, 2, 3, 4, 5],
        specialNumbers: [3], // always 3 to make assertion clear
        drawDate: Date.now() - i * 86400000,
      }));
      const predictions = runAllModels(cfg, history);
      const result = selectBudgetTickets(cfg, predictions, 75, 20, history);
      const allSpecial = result.tickets.flatMap(t => t.specialNumbers);
      // At least some tickets should have special numbers from history
      expect(allSpecial.length).toBeGreaterThan(0);
      // The most frequent special number (3) should appear in selections
      expect(allSpecial).toContain(3);
    });

    it("respects lower budget constraint", () => {
      const history = mockHistory(powerball, 100);
      const preds = runAllModels(powerball, history);
      const selection = selectBudgetTickets(powerball, preds, 10, 20);
      // $10 / $2 = 5 tickets max
      expect(selection.tickets.length).toBeLessThanOrEqual(5);
      expect(selection.totalCost).toBeLessThanOrEqual(10);
    });
  });

  describe("Monte Carlo simulation variation", () => {
    it("monte_carlo produces stable output for identical inputs", () => {
      const cfg = FLORIDA_GAMES["fantasy_5"];
      const history = mockHistory(cfg, 50);
      const r1 = runAllModels(cfg, history).find(p => p.modelName === "monte_carlo");
      const r2 = runAllModels(cfg, history).find(p => p.modelName === "monte_carlo");
      expect(r1!.mainNumbers).toEqual(r2!.mainNumbers);
    });

    it("monte_carlo internal simulations produce varied draws", () => {
      const cfg = FLORIDA_GAMES["fantasy_5"];
      const nums = Array.from({ length: cfg.mainMax }, (_, i) => i + 1);
      const weights = nums.map(() => 1); // uniform weights
      const draw0 = weightedSampleWithoutReplacement(nums, weights, cfg.mainCount, 0);
      const draw1 = weightedSampleWithoutReplacement(nums, weights, cfg.mainCount, 1);
      const draw100 = weightedSampleWithoutReplacement(nums, weights, cfg.mainCount, 100);
      // At least two of the three should differ
      const allSame = JSON.stringify(draw0) === JSON.stringify(draw1)
                   && JSON.stringify(draw1) === JSON.stringify(draw100);
      expect(allSame).toBe(false);
    });
  });
});
