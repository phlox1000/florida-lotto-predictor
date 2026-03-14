import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("compare.results", () => {
  it("returns comparisons and modelSummary arrays", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.results({ gameType: "fantasy_5", limit: 10 });

    expect(result).toHaveProperty("comparisons");
    expect(result).toHaveProperty("modelSummary");
    expect(result).toHaveProperty("gameType", "fantasy_5");
    expect(Array.isArray(result.comparisons)).toBe(true);
    expect(Array.isArray(result.modelSummary)).toBe(true);
  });

  it("each comparison has required fields", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.results({ gameType: "powerball", limit: 5 });

    for (const comp of result.comparisons) {
      expect(comp).toHaveProperty("drawId");
      expect(comp).toHaveProperty("gameType");
      expect(comp).toHaveProperty("drawDate");
      expect(comp).toHaveProperty("mainNumbers");
      expect(comp).toHaveProperty("specialNumbers");
      expect(Array.isArray(comp.mainNumbers)).toBe(true);
    }
  });

  it("model summary entries have correct structure", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.results({ gameType: "fantasy_5", limit: 5 });

    for (const model of result.modelSummary) {
      expect(model).toHaveProperty("modelName");
      expect(model).toHaveProperty("totalEvaluated");
      expect(model).toHaveProperty("avgMainHits");
      expect(model).toHaveProperty("avgSpecialHits");
      expect(model).toHaveProperty("maxMainHits");
      expect(typeof model.avgMainHits).toBe("number");
    }
  });
});

describe("compare.drawDetail", () => {
  it("returns draw and modelResults for non-existent draw", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.compare.drawDetail({ drawId: 999999 });

    // Non-existent draw should return null draw
    expect(result.draw).toBeNull();
    expect(Array.isArray(result.modelResults)).toBe(true);
    expect(result.modelResults.length).toBe(0);
  });
});

describe("export.ticketsPdf", () => {
  it("returns structured PDF data with all fields", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const tickets = [
      { mainNumbers: [1, 5, 12, 23, 31], specialNumbers: [], modelSource: "random", confidence: 0.45 },
      { mainNumbers: [3, 8, 15, 22, 36], specialNumbers: [], modelSource: "poisson_standard", confidence: 0.62 },
      { mainNumbers: [7, 14, 19, 28, 33], specialNumbers: [], modelSource: "ai_oracle", confidence: 0.78 },
    ];

    const result = await caller.export.ticketsPdf({
      gameType: "fantasy_5",
      gameName: "Fantasy 5",
      tickets,
      budget: 75,
      totalCost: 3,
    });

    expect(result.gameName).toBe("Fantasy 5");
    expect(result.gameType).toBe("fantasy_5");
    expect(result.tickets).toHaveLength(3);
    expect(result.budget).toBe(75);
    expect(result.totalCost).toBe(3);
    expect(result.ticketCount).toBe(3);
    expect(result.generatedAt).toBeTruthy();
  });

  it("handles full 20-ticket selection", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const tickets = Array.from({ length: 20 }, (_, i) => ({
      mainNumbers: [i + 1, i + 2, i + 3, i + 4, i + 5],
      specialNumbers: [1],
      modelSource: "random",
      confidence: 0.5,
    }));

    const result = await caller.export.ticketsPdf({
      gameType: "powerball",
      gameName: "Powerball",
      tickets,
      budget: 75,
      totalCost: 40,
    });

    expect(result.ticketCount).toBe(20);
    expect(result.tickets).toHaveLength(20);
  });
});
