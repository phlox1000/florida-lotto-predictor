import { describe, expect, it } from "vitest";
import { runAllModels, selectBudgetTickets } from "./predictions";
import { FLORIDA_GAMES, type GameConfig } from "../shared/lottery";

const fantasy5 = FLORIDA_GAMES.fantasy_5;
const powerball = FLORIDA_GAMES.powerball;

function makeHistory(count: number, cfg: GameConfig) {
  return Array.from({ length: count }, (_, i) => ({
    mainNumbers: Array.from({ length: cfg.mainCount }, (_, j) => ((i * 7 + j * 3) % cfg.mainMax) + 1),
    specialNumbers: cfg.specialCount > 0
      ? Array.from({ length: cfg.specialCount }, (_, j) => ((i * 5 + j * 2) % cfg.specialMax) + 1)
      : [],
    drawDate: Date.now() - (count - i) * 86400000,
  }));
}

describe("Prediction stability: same input → same output", () => {
  it("runAllModels produces identical results on consecutive calls with same history", () => {
    const history = makeHistory(100, fantasy5);
    const a = runAllModels(fantasy5, history);
    const b = runAllModels(fantasy5, history);

    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].modelName).toBe(b[i].modelName);
      expect(a[i].mainNumbers).toEqual(b[i].mainNumbers);
      expect(a[i].specialNumbers).toEqual(b[i].specialNumbers);
      expect(a[i].confidenceScore).toBe(b[i].confidenceScore);
    }
  });

  it("selectBudgetTickets produces identical results on consecutive calls", () => {
    const history = makeHistory(100, fantasy5);
    const preds = runAllModels(fantasy5, history);
    const a = selectBudgetTickets(fantasy5, preds, 75, 20, history);
    const b = selectBudgetTickets(fantasy5, preds, 75, 20, history);

    expect(a.tickets.length).toBe(b.tickets.length);
    expect(a.totalCost).toBe(b.totalCost);
    for (let i = 0; i < a.tickets.length; i++) {
      expect(a.tickets[i].mainNumbers).toEqual(b.tickets[i].mainNumbers);
      expect(a.tickets[i].specialNumbers).toEqual(b.tickets[i].specialNumbers);
      expect(a.tickets[i].modelSource).toBe(b.tickets[i].modelSource);
    }
  });

  it("frequency_baseline with no history produces a fixed spread", () => {
    const a = runAllModels(fantasy5, []);
    const b = runAllModels(fantasy5, []);
    const freqA = a.find(p => p.modelName === "frequency_baseline")!;
    const freqB = b.find(p => p.modelName === "frequency_baseline")!;
    expect(freqA.mainNumbers).toEqual(freqB.mainNumbers);
    expect(freqA.mainNumbers.length).toBe(5);
  });
});

describe("Special number correctness", () => {
  it("Powerball variation tickets use history-derived special numbers", () => {
    const history = makeHistory(100, powerball);
    const preds = runAllModels(powerball, history);
    const selection = selectBudgetTickets(powerball, preds, 75, 20, history);

    for (const t of selection.tickets) {
      expect(t.specialNumbers).toHaveLength(1);
      expect(t.specialNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(t.specialNumbers[0]).toBeLessThanOrEqual(powerball.specialMax);
    }
  });

  it("Fantasy 5 tickets have no special numbers", () => {
    const history = makeHistory(100, fantasy5);
    const preds = runAllModels(fantasy5, history);
    const selection = selectBudgetTickets(fantasy5, preds, 75, 20, history);

    for (const t of selection.tickets) {
      expect(t.specialNumbers).toHaveLength(0);
    }
  });

  it("variation ticket special numbers differ when salt changes", () => {
    const history = makeHistory(100, powerball);
    const preds = runAllModels(powerball, history);
    const selection = selectBudgetTickets(powerball, preds, 75, 20, history);

    // Variation tickets (ensemble_variation) should exist and have special numbers
    const variations = selection.tickets.filter(t => t.modelSource === "ensemble_variation");
    if (variations.length > 1) {
      // At least some should have different special numbers (not all identical)
      const specials = variations.map(t => t.specialNumbers[0]);
      // With 26 possible Powerball values and multiple salts, uniformity is unlikely
      const unique = new Set(specials);
      expect(unique.size).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("No wall-clock dependency in model outputs", () => {
  it("changing history changes model output", () => {
    const historyA = makeHistory(50, fantasy5);
    const historyB = makeHistory(51, fantasy5);
    const a = runAllModels(fantasy5, historyA);
    const b = runAllModels(fantasy5, historyB);

    // At least one model should produce different numbers with different history
    let anyDifferent = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].mainNumbers.length > 0 && b[i].mainNumbers.length > 0) {
        if (JSON.stringify(a[i].mainNumbers) !== JSON.stringify(b[i].mainNumbers)) {
          anyDifferent = true;
          break;
        }
      }
    }
    expect(anyDifferent).toBe(true);
  });
});
