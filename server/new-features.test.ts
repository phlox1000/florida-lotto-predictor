import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin",
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

// ─── Quick Pick Tests ───────────────────────────────────────────────────────

describe("predictions.quickPick", () => {
  it("generates correct number of quick picks for Fantasy 5", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "fantasy_5", count: 5 });

    expect(result.picks).toHaveLength(5);
    expect(result.gameType).toBe("fantasy_5");
    expect(result.gameName).toBe("Fantasy 5");
  });

  it("generates valid number ranges for Fantasy 5 (1-36, 5 numbers)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "fantasy_5", count: 10 });

    for (const pick of result.picks) {
      expect(pick.mainNumbers).toHaveLength(5);
      expect(pick.specialNumbers).toHaveLength(0);
      // All numbers should be in range 1-36
      for (const n of pick.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(36);
      }
      // Numbers should be sorted
      for (let i = 1; i < pick.mainNumbers.length; i++) {
        expect(pick.mainNumbers[i]).toBeGreaterThan(pick.mainNumbers[i - 1]);
      }
      // All numbers should be unique
      expect(new Set(pick.mainNumbers).size).toBe(pick.mainNumbers.length);
    }
  });

  it("generates valid Powerball picks with special number", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "powerball", count: 3 });

    for (const pick of result.picks) {
      expect(pick.mainNumbers).toHaveLength(5);
      expect(pick.specialNumbers).toHaveLength(1);
      // Main numbers: 1-69
      for (const n of pick.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(69);
      }
      // Powerball: 1-26
      expect(pick.specialNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(pick.specialNumbers[0]).toBeLessThanOrEqual(26);
    }
  });

  it("generates valid digit game picks (Pick 3)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "pick_3", count: 5 });

    for (const pick of result.picks) {
      expect(pick.mainNumbers).toHaveLength(3);
      for (const n of pick.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(9);
      }
    }
  });

  it("generates valid digit game picks (Pick 5)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "pick_5", count: 3 });

    for (const pick of result.picks) {
      expect(pick.mainNumbers).toHaveLength(5);
      for (const n of pick.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(9);
      }
    }
  });

  it("generates valid Mega Millions picks", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "mega_millions", count: 2 });

    for (const pick of result.picks) {
      expect(pick.mainNumbers).toHaveLength(5);
      expect(pick.specialNumbers).toHaveLength(1);
      // Main: 1-70
      for (const n of pick.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(70);
      }
      // Mega Ball: 1-25
      expect(pick.specialNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(pick.specialNumbers[0]).toBeLessThanOrEqual(25);
    }
  });

  it("generates valid Florida Lotto picks (6 numbers, 1-53)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.predictions.quickPick({ gameType: "florida_lotto", count: 3 });

    for (const pick of result.picks) {
      expect(pick.mainNumbers).toHaveLength(6);
      expect(pick.specialNumbers).toHaveLength(0);
      for (const n of pick.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(53);
      }
      expect(new Set(pick.mainNumbers).size).toBe(6);
    }
  });

  it("respects the count parameter", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result1 = await caller.predictions.quickPick({ gameType: "fantasy_5", count: 1 });
    expect(result1.picks).toHaveLength(1);

    const result20 = await caller.predictions.quickPick({ gameType: "fantasy_5", count: 20 });
    expect(result20.picks).toHaveLength(20);
  });

  it("produces different results across calls (randomness)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const results = await Promise.all(
      Array.from({ length: 5 }, () => caller.predictions.quickPick({ gameType: "fantasy_5", count: 1 }))
    );
    const allSame = results.every(
      r => JSON.stringify(r.picks[0].mainNumbers) === JSON.stringify(results[0].picks[0].mainNumbers)
    );
    // Extremely unlikely all 5 are identical
    expect(allSame).toBe(false);
  });

  it("validates all active game types produce valid picks", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const activeGames = GAME_TYPES.filter(g => !FLORIDA_GAMES[g].schedule.ended);

    for (const gameType of activeGames) {
      const cfg = FLORIDA_GAMES[gameType];
      const result = await caller.predictions.quickPick({ gameType, count: 2 });
      expect(result.picks).toHaveLength(2);
      expect(result.gameType).toBe(gameType);

      for (const pick of result.picks) {
        expect(pick.mainNumbers).toHaveLength(cfg.mainCount);
        expect(pick.specialNumbers).toHaveLength(cfg.specialCount);
      }
    }
  });
});

// ─── Auto-Fetch Cron Tests ──────────────────────────────────────────────────

describe("auto-fetch cron module", () => {
  it("exports required functions", async () => {
    const cron = await import("./cron");
    expect(typeof cron.getLastAutoFetchResult).toBe("function");
    expect(typeof cron.isAutoFetchActive).toBe("function");
    expect(typeof cron.getAutoFetchRunning).toBe("function");
    expect(typeof cron.runAutoFetch).toBe("function");
  });

  it("isAutoFetchActive returns a boolean", async () => {
    const cron = await import("./cron");
    expect(typeof cron.isAutoFetchActive()).toBe("boolean");
  });

  it("getAutoFetchRunning returns a boolean", async () => {
    const cron = await import("./cron");
    expect(typeof cron.getAutoFetchRunning()).toBe("boolean");
  });

  it("getLastAutoFetchResult returns null initially or a valid result", async () => {
    const cron = await import("./cron");
    const result = cron.getLastAutoFetchResult();
    if (result !== null) {
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("totalNewDraws");
      expect(result).toHaveProperty("totalEvaluations");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.errors)).toBe(true);
    }
  });
});

describe("dataFetch.autoFetchStatus", () => {
  it("returns status object with expected shape", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const status = await caller.dataFetch.autoFetchStatus();

    expect(status).toHaveProperty("isScheduleActive");
    expect(status).toHaveProperty("isRunning");
    expect(typeof status.isScheduleActive).toBe("boolean");
    expect(typeof status.isRunning).toBe("boolean");
    // lastRun can be null or an object
    if (status.lastRun) {
      expect(status.lastRun).toHaveProperty("timestamp");
      expect(status.lastRun).toHaveProperty("totalNewDraws");
      expect(status.lastRun).toHaveProperty("totalEvaluations");
      expect(status.lastRun).toHaveProperty("errors");
    }
  });
});

// ─── Model Trends Tests ────────────────────────────────────────────────────

describe("leaderboard.trends", () => {
  it("returns expected shape with empty data", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.leaderboard.trends({ weeksBack: 4 });

    expect(result).toHaveProperty("weeks");
    expect(result).toHaveProperty("models");
    expect(Array.isArray(result.weeks)).toBe(true);
    expect(typeof result.models).toBe("object");
  });

  it("accepts optional gameType filter", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.leaderboard.trends({ gameType: "fantasy_5", weeksBack: 8 });

    expect(result).toHaveProperty("weeks");
    expect(result).toHaveProperty("models");
  });

  it("accepts various weeksBack values", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    const result4 = await caller.leaderboard.trends({ weeksBack: 4 });
    const result52 = await caller.leaderboard.trends({ weeksBack: 52 });

    expect(result4).toHaveProperty("weeks");
    expect(result52).toHaveProperty("weeks");
  });

  it("models data has correct structure when data exists", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.leaderboard.trends({ weeksBack: 12 });

    for (const [modelName, dataPoints] of Object.entries(result.models)) {
      expect(typeof modelName).toBe("string");
      expect(Array.isArray(dataPoints)).toBe(true);
      for (const dp of dataPoints) {
        expect(dp).toHaveProperty("week");
        expect(dp).toHaveProperty("avgHits");
        expect(dp).toHaveProperty("count");
        expect(typeof dp.week).toBe("string");
        expect(typeof dp.avgHits).toBe("number");
        expect(typeof dp.count).toBe("number");
      }
    }
  });

  it("weeks are sorted chronologically", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.leaderboard.trends({ weeksBack: 12 });

    for (let i = 1; i < result.weeks.length; i++) {
      expect(result.weeks[i] >= result.weeks[i - 1]).toBe(true);
    }
  });
});

// ─── Model Trends DB Helper Tests ──────────────────────────────────────────

describe("getModelTrends db helper", () => {
  it("returns an array", async () => {
    const { getModelTrends } = await import("./db");
    const result = await getModelTrends(undefined, 4);
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts gameType filter", async () => {
    const { getModelTrends } = await import("./db");
    const result = await getModelTrends("fantasy_5", 8);
    expect(Array.isArray(result)).toBe(true);
  });
});
