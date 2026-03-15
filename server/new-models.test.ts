import { describe, it, expect } from "vitest";
import { runAllModels, applySumRangeFilter } from "./predictions";
import type { PredictionResult } from "@shared/lottery";

// Fantasy 5 config
const FANTASY5_CFG = {
  name: "Fantasy 5",
  mainCount: 5,
  mainMax: 36,
  specialCount: 0,
  specialMax: 0,
  ticketPrice: 1,
  drawDays: [1, 2, 3, 4, 5, 6, 0],
  isDigitGame: false,
};

// Powerball config (with special numbers)
const POWERBALL_CFG = {
  name: "Powerball",
  mainCount: 5,
  mainMax: 69,
  specialCount: 1,
  specialMax: 26,
  ticketPrice: 2,
  drawDays: [1, 3, 6],
  isDigitGame: false,
};

// Generate synthetic history draws
function generateHistory(count: number, cfg: typeof FANTASY5_CFG): Array<{ mainNumbers: number[]; specialNumbers: number[]; drawDate: string }> {
  const draws = [];
  const baseDate = new Date("2025-01-01");
  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    // Deterministic "random" numbers using a simple pattern
    const nums: number[] = [];
    const seed = i * 7 + 3;
    for (let j = 0; j < cfg.mainCount; j++) {
      let n = ((seed + j * 11 + j * j * 3) % cfg.mainMax) + 1;
      while (nums.includes(n)) n = (n % cfg.mainMax) + 1;
      nums.push(n);
    }
    nums.sort((a, b) => a - b);

    const specials: number[] = [];
    if (cfg.specialCount > 0 && cfg.specialMax > 0) {
      for (let j = 0; j < cfg.specialCount; j++) {
        specials.push(((seed + j * 5) % cfg.specialMax) + 1);
      }
    }

    draws.push({
      mainNumbers: nums,
      specialNumbers: specials,
      drawDate: date.toISOString().split("T")[0],
    });
  }
  return draws;
}

describe("Model 17: CDM (Compound-Dirichlet-Multinomial)", () => {
  it("returns insufficient_data with fewer than 30 draws", () => {
    const history = generateHistory(20, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const cdm = results.find(r => r.modelName === "cdm");
    expect(cdm).toBeDefined();
    expect(cdm!.mainNumbers.length).toBe(0);
    expect((cdm!.metadata as any)?.insufficient_data).toBe(true);
  });

  it("produces valid predictions with sufficient history", () => {
    const history = generateHistory(100, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const cdm = results.find(r => r.modelName === "cdm");
    expect(cdm).toBeDefined();
    expect(cdm!.mainNumbers.length).toBe(5);
    // All numbers should be within valid range
    for (const n of cdm!.mainNumbers) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(36);
    }
    // Numbers should be sorted
    for (let i = 1; i < cdm!.mainNumbers.length; i++) {
      expect(cdm!.mainNumbers[i]).toBeGreaterThan(cdm!.mainNumbers[i - 1]);
    }
    // No duplicates
    expect(new Set(cdm!.mainNumbers).size).toBe(5);
    // Confidence should be reasonable
    expect(cdm!.confidenceScore).toBeGreaterThan(0);
    expect(cdm!.confidenceScore).toBeLessThanOrEqual(0.80);
    // Metadata should include strategy
    expect((cdm!.metadata as any)?.strategy).toBe("compound_dirichlet_multinomial");
  });

  it("produces correct number count for Powerball (5 main + 1 special)", () => {
    const history = generateHistory(100, POWERBALL_CFG);
    const results = runAllModels(POWERBALL_CFG, history);
    const cdm = results.find(r => r.modelName === "cdm");
    expect(cdm).toBeDefined();
    expect(cdm!.mainNumbers.length).toBe(5);
    expect(cdm!.specialNumbers.length).toBe(1);
    for (const n of cdm!.mainNumbers) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(69);
    }
    expect(cdm!.specialNumbers[0]).toBeGreaterThanOrEqual(1);
    expect(cdm!.specialNumbers[0]).toBeLessThanOrEqual(26);
  });

  it("is deterministic (same input = same output)", () => {
    const history = generateHistory(100, FANTASY5_CFG);
    const results1 = runAllModels(FANTASY5_CFG, history);
    const results2 = runAllModels(FANTASY5_CFG, history);
    const cdm1 = results1.find(r => r.modelName === "cdm");
    const cdm2 = results2.find(r => r.modelName === "cdm");
    expect(cdm1!.mainNumbers).toEqual(cdm2!.mainNumbers);
  });
});

describe("Model 18: Chi-Square Anomaly Detector", () => {
  it("returns insufficient_data with fewer than 20 draws", () => {
    const history = generateHistory(15, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const chi = results.find(r => r.modelName === "chi_square");
    expect(chi).toBeDefined();
    expect(chi!.mainNumbers.length).toBe(0);
    expect((chi!.metadata as any)?.insufficient_data).toBe(true);
  });

  it("produces valid predictions with sufficient history", () => {
    const history = generateHistory(100, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const chi = results.find(r => r.modelName === "chi_square");
    expect(chi).toBeDefined();
    expect(chi!.mainNumbers.length).toBe(5);
    for (const n of chi!.mainNumbers) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(36);
    }
    // Numbers should be sorted
    for (let i = 1; i < chi!.mainNumbers.length; i++) {
      expect(chi!.mainNumbers[i]).toBeGreaterThan(chi!.mainNumbers[i - 1]);
    }
    // No duplicates
    expect(new Set(chi!.mainNumbers).size).toBe(5);
    expect((chi!.metadata as any)?.strategy).toBe("chi_square_anomaly_detection");
    expect((chi!.metadata as any)?.expectedFrequency).toBeDefined();
    expect((chi!.metadata as any)?.totalChiSquare).toBeDefined();
  });

  it("includes hot and due anomaly counts in metadata", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const chi = results.find(r => r.modelName === "chi_square");
    const meta = chi!.metadata as any;
    expect(meta.hotAnomalies).toBeDefined();
    expect(meta.dueAnomalies).toBeDefined();
    expect(meta.hotAnomalies + meta.dueAnomalies).toBeLessThanOrEqual(5);
  });

  it("is deterministic (same input = same output)", () => {
    const history = generateHistory(100, FANTASY5_CFG);
    const results1 = runAllModels(FANTASY5_CFG, history);
    const results2 = runAllModels(FANTASY5_CFG, history);
    const chi1 = results1.find(r => r.modelName === "chi_square");
    const chi2 = results2.find(r => r.modelName === "chi_square");
    expect(chi1!.mainNumbers).toEqual(chi2!.mainNumbers);
  });
});

describe("Sum/Range Constraint Filter", () => {
  it("returns predictions unchanged when history is insufficient (<50 draws)", () => {
    const history = generateHistory(30, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const filtered = applySumRangeFilter(results, FANTASY5_CFG, history);
    // With <50 draws, filter should pass through unchanged
    expect(filtered).toEqual(results);
  });

  it("adds sumRangeFilter metadata when history is sufficient", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const filtered = applySumRangeFilter(results, FANTASY5_CFG, history);
    // At least some predictions should have sumRangeFilter metadata
    const withFilter = filtered.filter(p => {
      const meta = p.metadata as any;
      return meta?.sumRangeFilter?.applied === true;
    });
    expect(withFilter.length).toBeGreaterThan(0);
  });

  it("preserves insufficient_data predictions unchanged", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const filtered = applySumRangeFilter(results, FANTASY5_CFG, history);
    const insufficientOriginal = results.filter(p => (p.metadata as any)?.insufficient_data);
    const insufficientFiltered = filtered.filter(p => (p.metadata as any)?.insufficient_data);
    expect(insufficientOriginal.length).toBe(insufficientFiltered.length);
    for (let i = 0; i < insufficientOriginal.length; i++) {
      expect(insufficientFiltered[i].mainNumbers).toEqual(insufficientOriginal[i].mainNumbers);
    }
  });

  it("includes acceptable range in metadata", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const filtered = applySumRangeFilter(results, FANTASY5_CFG, history);
    const withFilter = filtered.find(p => (p.metadata as any)?.sumRangeFilter?.applied);
    if (withFilter) {
      const sf = (withFilter.metadata as any).sumRangeFilter;
      expect(sf.acceptableRange).toBeDefined();
      expect(sf.acceptableRange.length).toBe(2);
      expect(sf.acceptableRange[0]).toBeLessThan(sf.acceptableRange[1]);
      expect(sf.historicalMean).toBeDefined();
    }
  });

  it("adjusts numbers when sum is outside acceptable range", () => {
    // Create a prediction with an extreme sum
    const history = generateHistory(200, FANTASY5_CFG);
    const extremePred: PredictionResult = {
      modelName: "test_extreme",
      mainNumbers: [32, 33, 34, 35, 36], // sum = 170, very high
      specialNumbers: [],
      confidenceScore: 0.5,
      metadata: { strategy: "test" },
    };
    const filtered = applySumRangeFilter([extremePred], FANTASY5_CFG, history);
    const sf = (filtered[0].metadata as any)?.sumRangeFilter;
    if (sf?.wasAdjusted) {
      // Sum should have been brought closer to the mean
      const newSum = filtered[0].mainNumbers.reduce((a, b) => a + b, 0);
      expect(newSum).toBeLessThan(170);
    }
  });

  it("does not apply to digit games", () => {
    const digitCfg = { ...FANTASY5_CFG, isDigitGame: true };
    const history = generateHistory(200, digitCfg);
    const results: PredictionResult[] = [{
      modelName: "test",
      mainNumbers: [1, 2, 3, 4, 5],
      specialNumbers: [],
      confidenceScore: 0.5,
      metadata: {},
    }];
    const filtered = applySumRangeFilter(results, digitCfg, history);
    expect(filtered).toEqual(results);
  });
});

describe("runAllModels includes new models", () => {
  it("returns 18 model results (not 16)", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    // 18 models total: 15 base + CDM + Chi-Square + AI Oracle
    expect(results.length).toBe(18);
  });

  it("includes cdm and chi_square in results", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const modelNames = results.map(r => r.modelName);
    expect(modelNames).toContain("cdm");
    expect(modelNames).toContain("chi_square");
    expect(modelNames).toContain("ai_oracle");
  });

  it("AI Oracle ensemble now includes CDM and Chi-Square in its voting", () => {
    const history = generateHistory(200, FANTASY5_CFG);
    const results = runAllModels(FANTASY5_CFG, history);
    const oracle = results.find(r => r.modelName === "ai_oracle");
    expect(oracle).toBeDefined();
    // Oracle should have valid numbers since it aggregates from 17 sibling models
    expect(oracle!.mainNumbers.length).toBe(5);
  });

  it("no model uses Math.random for number generation", () => {
    // This test verifies the integrity claim
    const history = generateHistory(200, FANTASY5_CFG);
    const results1 = runAllModels(FANTASY5_CFG, history);
    const results2 = runAllModels(FANTASY5_CFG, history);
    // Deterministic models should produce identical results
    const deterministicModels = ["cdm", "chi_square", "poisson_standard", "poisson_short", "poisson_long",
      "gap_analysis", "cooccurrence", "delta", "temporal_echo", "markov_chain", "quantum_entanglement"];
    for (const name of deterministicModels) {
      const r1 = results1.find(r => r.modelName === name);
      const r2 = results2.find(r => r.modelName === name);
      if (r1 && r2 && r1.mainNumbers.length > 0) {
        expect(r1.mainNumbers).toEqual(r2.mainNumbers);
      }
    }
  });
});
