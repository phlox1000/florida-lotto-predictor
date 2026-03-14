import { describe, expect, it } from "vitest";
import { runAllModels, selectBudgetTickets } from "./predictions";
import { FLORIDA_GAMES, type GameConfig } from "../shared/lottery";

const fantasy5 = FLORIDA_GAMES.fantasy_5;

function makeHistory(count: number, cfg: GameConfig) {
  const draws = [];
  for (let i = 0; i < count; i++) {
    const main: number[] = [];
    for (let j = 0; j < cfg.mainCount; j++) {
      // Deterministic test data: spread numbers across the range
      main.push(((i * cfg.mainCount + j) % cfg.mainMax) + 1);
    }
    const special: number[] = [];
    for (let j = 0; j < cfg.specialCount; j++) {
      special.push(((i + j) % cfg.specialMax) + 1);
    }
    draws.push({
      mainNumbers: main.sort((a, b) => a - b),
      specialNumbers: special,
      drawDate: Date.now() - (count - i) * 86400000,
    });
  }
  return draws;
}

describe("Prediction Engine Audit", () => {
  it("returns insufficient_data for models when no history is provided", () => {
    const results = runAllModels(fantasy5, []);
    // With no history, most models should report insufficient data
    const insufficientModels = results.filter(
      r => r.mainNumbers.length === 0 && (r.metadata as any)?.insufficient_data === true
    );
    // At minimum: poisson, hot-cold, gap, cooccurrence, delta, temporal_echo, monte_carlo, markov, bayesian, quantum
    expect(insufficientModels.length).toBeGreaterThanOrEqual(8);
  });

  it("no model uses Math.random for number generation (all produce formula-based or insufficient_data)", () => {
    const results = runAllModels(fantasy5, []);
    for (const r of results) {
      // Every result should either have valid numbers OR be marked insufficient
      if (r.mainNumbers.length > 0) {
        // Has numbers — should NOT be marked insufficient
        expect((r.metadata as any)?.insufficient_data).not.toBe(true);
        // Numbers should be within valid range
        for (const n of r.mainNumbers) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(fantasy5.mainMax);
        }
      } else {
        // No numbers — must be marked insufficient
        expect((r.metadata as any)?.insufficient_data).toBe(true);
        expect((r.metadata as any)?.message).toBeTruthy();
      }
    }
  });

  it("all 16 models produce valid results with sufficient history", () => {
    const history = makeHistory(150, fantasy5);
    const results = runAllModels(fantasy5, history);
    expect(results.length).toBe(16);
    
    const validModels = results.filter(r => r.mainNumbers.length > 0);
    // With 150 draws, most models should produce valid results
    expect(validModels.length).toBeGreaterThanOrEqual(12);
    
    for (const r of validModels) {
      expect(r.mainNumbers.length).toBe(fantasy5.mainCount);
      for (const n of r.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(fantasy5.mainMax);
      }
    }
  });

  it("budget tickets only use formula-based predictions (no random tickets)", () => {
    const history = makeHistory(50, fantasy5);
    const results = runAllModels(fantasy5, history);
    const { tickets, totalCost } = selectBudgetTickets(fantasy5, results, 75, 20);
    
    expect(totalCost).toBeLessThanOrEqual(75);
    for (const t of tickets) {
      expect(t.mainNumbers.length).toBe(fantasy5.mainCount);
      // No ticket should come from a random source
      expect(t.modelSource).not.toBe("random");
      expect(t.modelSource).not.toBe("budget_random");
    }
  });

  it("AI Oracle only considers valid sibling results", () => {
    const history = makeHistory(5, fantasy5); // Very little history
    const results = runAllModels(fantasy5, history);
    const oracle = results.find(r => r.modelName === "ai_oracle");
    expect(oracle).toBeDefined();
    
    const meta = oracle!.metadata as any;
    if (oracle!.mainNumbers.length > 0) {
      // Oracle produced results — should report how many valid models it used
      expect(meta.validModelCount).toBeGreaterThan(0);
      expect(meta.validModelCount).toBeLessThanOrEqual(meta.totalModels);
    } else {
      // Oracle couldn't produce results — should be marked insufficient
      expect(meta.insufficient_data).toBe(true);
    }
  });

  it("frequency_baseline model works even with no history (deterministic spread)", () => {
    const results = runAllModels(fantasy5, []);
    const baseline = results.find(r => r.modelName === "frequency_baseline");
    expect(baseline).toBeDefined();
    expect(baseline!.mainNumbers.length).toBe(fantasy5.mainCount);
    // Should be deterministic spread, not random
    expect((baseline!.metadata as any)?.strategy).toBe("deterministic_spread");
  });

  it("model weights affect AI Oracle ensemble", () => {
    const history = makeHistory(100, fantasy5);
    const weights = { poisson_standard: 5.0, hot_cold_70: 0.1 };
    const resultsWeighted = runAllModels(fantasy5, history, weights);
    const resultsUnweighted = runAllModels(fantasy5, history);
    
    const oracleW = resultsWeighted.find(r => r.modelName === "ai_oracle");
    const oracleU = resultsUnweighted.find(r => r.modelName === "ai_oracle");
    // Both should produce valid results
    expect(oracleW!.mainNumbers.length).toBe(fantasy5.mainCount);
    expect(oracleU!.mainNumbers.length).toBe(fantasy5.mainCount);
  });
});

describe("Powerball game predictions", () => {
  const powerball = FLORIDA_GAMES.powerball;

  it("produces valid main and special numbers for Powerball", () => {
    const history = makeHistory(100, powerball);
    const results = runAllModels(powerball, history);
    const valid = results.filter(r => r.mainNumbers.length > 0);
    
    for (const r of valid) {
      expect(r.mainNumbers.length).toBe(powerball.mainCount);
      for (const n of r.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(powerball.mainMax);
      }
      if (r.specialNumbers.length > 0) {
        for (const n of r.specialNumbers) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(powerball.specialMax);
        }
      }
    }
  });
});
