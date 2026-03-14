import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx };
}

describe("tracker.logPurchase", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logPurchase({
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        purchaseDate: Date.now(),
        cost: 1,
      })
    ).rejects.toThrow();
  });

  it("validates input schema - requires gameType", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logPurchase({
        gameType: "invalid_game" as any,
        mainNumbers: [1, 2, 3, 4, 5],
        purchaseDate: Date.now(),
        cost: 1,
      })
    ).rejects.toThrow();
  });

  it("validates cost must be non-negative", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logPurchase({
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        purchaseDate: Date.now(),
        cost: -5,
      })
    ).rejects.toThrow();
  });
});

describe("tracker.logBulkPurchase", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logBulkPurchase({
        tickets: [
          { gameType: "fantasy_5", mainNumbers: [1, 2, 3, 4, 5], cost: 1 },
        ],
        purchaseDate: Date.now(),
      })
    ).rejects.toThrow();
  });

  it("validates ticket array schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logBulkPurchase({
        tickets: [
          { gameType: "invalid" as any, mainNumbers: [1], cost: 1 },
        ],
        purchaseDate: Date.now(),
      })
    ).rejects.toThrow();
  });
});

describe("tracker.updateOutcome", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.updateOutcome({ id: 1, outcome: "win", winAmount: 100 })
    ).rejects.toThrow();
  });

  it("validates outcome enum", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.updateOutcome({ id: 1, outcome: "invalid" as any })
    ).rejects.toThrow();
  });
});

describe("tracker.delete", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.delete({ id: 1 })
    ).rejects.toThrow();
  });
});

describe("tracker.stats", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tracker.stats()).rejects.toThrow();
  });
});

describe("tracker.statsByGame", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tracker.statsByGame()).rejects.toThrow();
  });
});

describe("dataFetch.pdfUploads", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dataFetch.pdfUploads()).rejects.toThrow();
  });
});
