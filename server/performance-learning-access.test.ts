import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const learningMocks = vi.hoisted(() => ({
  getLearningStatusByGame: vi.fn().mockResolvedValue({ tableLearningUsed: true }),
  runLearningBacktestComparison: vi.fn().mockResolvedValue({ scenarios: [] }),
}));

vi.mock("./services/learningValidation.service", () => learningMocks);

function createContext(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "oid",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("performance learning route access", () => {
  it("blocks non-admin users from learning diagnostics", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(caller.performance.learningStatus({ gameType: "fantasy_5", windowDays: 90 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.performance.learningBacktest({ gameType: "fantasy_5", lookbackDraws: 10, windowDays: 90 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(learningMocks.getLearningStatusByGame).not.toHaveBeenCalled();
    expect(learningMocks.runLearningBacktestComparison).not.toHaveBeenCalled();
  });

  it("allows admin users", async () => {
    const caller = appRouter.createCaller(createContext("admin"));

    const status = await caller.performance.learningStatus({ gameType: "fantasy_5", windowDays: 90 });
    const backtest = await caller.performance.learningBacktest({ gameType: "fantasy_5", lookbackDraws: 10, windowDays: 90 });

    expect(status).toEqual({ tableLearningUsed: true });
    expect(backtest).toEqual({ scenarios: [] });
    expect(learningMocks.getLearningStatusByGame).toHaveBeenCalledWith("fantasy_5", 1, 90);
    expect(learningMocks.runLearningBacktestComparison).toHaveBeenCalledWith({
      gameType: "fantasy_5",
      lookbackDraws: 10,
      userId: 1,
      windowDays: 90,
    });
  });
});
