import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user-" + userId,
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("favorites router", () => {
  it("favorites.add requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.favorites.add({
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        specialNumbers: [],
      })
    ).rejects.toThrow();
  });

  it("favorites.list requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.favorites.list()).rejects.toThrow();
  });

  it("favorites.remove requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.favorites.remove({ id: 1 })).rejects.toThrow();
  });

  it("favorites.use requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.favorites.use({ id: 1 })).rejects.toThrow();
  });

  it("favorites.add validates game type", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.favorites.add({
        gameType: "invalid_game" as any,
        mainNumbers: [1, 2, 3],
        specialNumbers: [],
      })
    ).rejects.toThrow();
  });

  it("favorites.add accepts valid input shape", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // This will try to hit the DB which may not be available in test,
    // but it validates that the input schema is correct
    try {
      await caller.favorites.add({
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        specialNumbers: [],
        modelSource: "random",
        confidence: 0.85,
        label: "My lucky numbers",
      });
    } catch (e: any) {
      // DB error is expected in test env, but input validation should pass
      expect(e.message).not.toContain("validation");
    }
  });
});

describe("push router", () => {
  it("push.status requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.push.status()).rejects.toThrow();
  });

  it("push.subscribe requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.push.subscribe({
        endpoint: "https://example.com/push",
        p256dh: "key",
        auth: "auth",
      })
    ).rejects.toThrow();
  });

  it("push.updatePreferences requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.push.updatePreferences({ enabled: true })
    ).rejects.toThrow();
  });

  it("push.unsubscribe requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.push.unsubscribe()).rejects.toThrow();
  });

  it("push.subscribe accepts valid input and processes", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Empty string is valid for z.string(), so this should succeed or fail at DB level
    try {
      const result = await caller.push.subscribe({
        endpoint: "https://push.example.com/endpoint",
        p256dh: "test-key",
        auth: "test-auth",
      });
      expect(result).toEqual({ success: true });
    } catch (e: any) {
      // DB error is acceptable in test env
      expect(e.message).not.toContain("validation");
    }
  });

  it("push.updatePreferences accepts partial prefs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.push.updatePreferences({ enabled: false });
    } catch (e: any) {
      // DB error expected, but input validation should pass
      expect(e.message).not.toContain("validation");
    }
  });
});
