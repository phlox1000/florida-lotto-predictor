import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    role: "user",
    loginMethod: "oauth",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    res: { clearCookie: () => {} } as any,
  };
}

describe("Ticket Scanner & Analytics", () => {
  it("ticketAnalytics requires authentication", async () => {
    const caller = appRouter.createCaller({
      user: null,
      res: { clearCookie: () => {} } as any,
    });
    await expect(caller.tickets.ticketAnalytics()).rejects.toThrow(/login/i);
  });

  it("ticketAnalytics returns expected shape for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tickets.ticketAnalytics();
    expect(result).toHaveProperty("modelsPlayedMost");
    expect(result).toHaveProperty("modelsWonMoney");
    expect(result).toHaveProperty("hitRateByModel");
    expect(result).toHaveProperty("middayVsEvening");
    expect(Array.isArray(result.modelsPlayedMost)).toBe(true);
    expect(Array.isArray(result.modelsWonMoney)).toBe(true);
    expect(Array.isArray(result.hitRateByModel)).toBe(true);
    expect(result.middayVsEvening).toHaveProperty("midday");
    expect(result.middayVsEvening).toHaveProperty("evening");
  });

  it("ticket generate returns valid ticket selection", async () => {
    const caller = appRouter.createCaller({
      user: null,
      res: { clearCookie: () => {} } as any,
    });
    const result = await caller.tickets.generate({
      gameType: "fantasy_5",
      budget: 10,
      maxTickets: 5,
    });
    expect(result).toHaveProperty("tickets");
    expect(result).toHaveProperty("gameType", "fantasy_5");
    expect(Array.isArray(result.tickets)).toBe(true);
    expect(result.tickets.length).toBeLessThanOrEqual(5);
  });
});
