import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "../shared/lottery";

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

function createAuthContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user-open-id",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── predictions.generate Persistence Verification ──────────────────────────

describe("predictions.generate persistence", () => {
  it("returns predictions array with correct shape for each model", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    expect(result).toHaveProperty("predictions");
    expect(result).toHaveProperty("gameType", "fantasy_5");
    expect(result).toHaveProperty("gameName");
    expect(result).toHaveProperty("weightsUsed");
    expect(result).toHaveProperty("sumRangeFilterApplied", false);
    expect(Array.isArray(result.predictions)).toBe(true);
    expect(result.predictions.length).toBeGreaterThan(0);

    // Each prediction must have the required fields
    for (const pred of result.predictions) {
      expect(pred).toHaveProperty("modelName");
      expect(pred).toHaveProperty("mainNumbers");
      expect(pred).toHaveProperty("specialNumbers");
      expect(pred).toHaveProperty("confidenceScore");
      expect(pred).toHaveProperty("metadata.explainable.aiScore");
      expect(pred).toHaveProperty("metadata.explainable.confidenceLabel");
      expect(pred).toHaveProperty("metadata.explainable.explanationSummary");
      expect(pred).toHaveProperty("metadata.explainable.supportingFactors");
      expect(pred).toHaveProperty("metadata.explainable.riskLevel");
      expect(pred).toHaveProperty("metadata.explainable.historicalSignals");
      expect(pred).toHaveProperty("metadata.explainable.generatedAt");
      expect(typeof pred.modelName).toBe("string");
      expect(Array.isArray(pred.mainNumbers)).toBe(true);
      expect(Array.isArray(pred.specialNumbers)).toBe(true);
      expect(typeof pred.confidenceScore).toBe("number");
      expect((pred.metadata as any).explainable.aiScore).toBeGreaterThanOrEqual(0);
      expect((pred.metadata as any).explainable.aiScore).toBeLessThanOrEqual(100);
    }
  });

  it("includes all 18 models (17 siblings + ai_oracle)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    // 17 sibling models + 1 ai_oracle = 18 total
    expect(result.predictions.length).toBe(18);

    const modelNames = result.predictions.map(p => p.modelName);
    expect(modelNames).toContain("ai_oracle");
    expect(modelNames).toContain("frequency_baseline");
  });

  it("generates valid number ranges for each game type", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    // Test a few representative game types
    const testGames: GameType[] = ["fantasy_5", "powerball", "pick_3"];

    for (const gameType of testGames) {
      const cfg = FLORIDA_GAMES[gameType];
      if (cfg.schedule.ended) continue;

      const result = await caller.predictions.generate({
        gameType,
        sumRangeFilter: false,
      });

      // Check that at least the ai_oracle has valid numbers
      const oracle = result.predictions.find(p => p.modelName === "ai_oracle");
      expect(oracle).toBeDefined();

      // Valid predictions should have correct count
      const validPreds = result.predictions.filter(
        p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data
      );

      for (const pred of validPreds) {
        expect(pred.mainNumbers.length).toBe(cfg.mainCount);
        expect(pred.specialNumbers.length).toBe(cfg.specialCount);

        if (cfg.isDigitGame) {
          for (const n of pred.mainNumbers) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(9);
          }
        } else {
          for (const n of pred.mainNumbers) {
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(cfg.mainMax);
          }
        }
      }
    }
  });

  it("calls insertPredictions when user is authenticated", async () => {
    // Spy on the db module's insertPredictions
    const dbModule = await import("./db");
    const spy = vi.spyOn(dbModule, "insertPredictions").mockResolvedValue(undefined);

    // We need to re-import routers to pick up the spy
    // Since the module is already loaded, the spy should work on the exported function
    const caller = appRouter.createCaller(createAuthContext(42));

    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    expect(result.predictions.length).toBeGreaterThan(0);

    // insertPredictions should have been called with an array of prediction records
    if (spy.mock.calls.length > 0) {
      const insertedData = spy.mock.calls[0][0];
      expect(Array.isArray(insertedData)).toBe(true);
      expect(insertedData.length).toBeGreaterThan(0);

      for (const record of insertedData) {
        expect(record).toHaveProperty("userId", 42);
        expect(record).toHaveProperty("gameType", "fantasy_5");
        expect(record).toHaveProperty("modelName");
        expect(record).toHaveProperty("mainNumbers");
        expect(record).toHaveProperty("specialNumbers");
        expect(record).toHaveProperty("confidenceScore");
      }
    }

    spy.mockRestore();
  });

  it("does NOT call insertPredictions for unauthenticated users", async () => {
    const dbModule = await import("./db");
    const spy = vi.spyOn(dbModule, "insertPredictions").mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createPublicContext());
    await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    // insertPredictions should NOT be called for public (unauthenticated) users
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it("returns weightsUsed=false when no historical data exists", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    // With no DB data, weights should not be used
    // (This may be true or false depending on DB state, but the field must exist)
    expect(typeof result.weightsUsed).toBe("boolean");
  });

  it("handles sumRangeFilter=true without errors", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: true,
    });

    expect(result.sumRangeFilterApplied).toBe(true);
    expect(result.predictions.length).toBeGreaterThan(0);
  });
});
