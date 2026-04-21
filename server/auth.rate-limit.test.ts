/**
 * Wiring tests for the per-IP rate limits on auth.login and auth.register.
 *
 * The store backend (Redis vs in-memory) is already covered by
 * server/lib/rateLimiter.test.ts. This file is specifically about whether
 * the auth router calls it correctly:
 *
 *   - With the right namespaced key (so login and register don't share a
 *     bucket, and so a future caller in another router doesn't either).
 *   - With the right policy (so a refactor doesn't silently loosen 5/hr
 *     to 5/min, etc.).
 *   - At the right moment (BEFORE the DB lookup and bcrypt; we don't want
 *     to pay 250ms of CPU per request that's about to be denied).
 *   - Translating denial into a TRPCError TOO_MANY_REQUESTS with the
 *     Retry-After header set in seconds.
 *
 * checkRateLimit is mocked with vi.mock so we control its return value
 * without needing to actually exhaust a real bucket. That keeps the tests
 * fast and lets us assert the call shape directly.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./lib/rateLimiter", () => ({
  checkRateLimit: vi.fn(),
}));

// Keep the heavy DB layer out of the import graph for these tests; the
// router only reaches it on the post-rate-limit path, which we don't
// exercise here. Also avoids a hard dependency on a live MySQL during CI.
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(async () => null),
  createUser: vi.fn(async () => undefined),
  getUserCount: vi.fn(async () => 1),
}));

// Mock the auth SDK so the register success path doesn't reach jose/JWT
// signing (which crashes without a configured JWT_SECRET in test env).
// We don't assert on the token contents — only that the rate limiter
// gets invoked with the right shape — so a stub return is fine.
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn(async () => "stub-session-token"),
    authenticateRequest: vi.fn(async () => null),
    authenticateOptionalRequest: vi.fn(async () => null),
  },
}));

import { appRouter } from "./routers";
import { checkRateLimit } from "./lib/rateLimiter";
import { getUserByEmail } from "./db";
import type { TrpcContext } from "./_core/context";

const mockedCheckRateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;
const mockedGetUserByEmail = getUserByEmail as unknown as ReturnType<typeof vi.fn>;

type SetHeaderCall = { name: string; value: string };

// NOTE: both `ip` and `cfConnectingIp` are required (no defaults) because
// JS default params trigger when `undefined` is explicitly passed, which
// would silently break tests that need to assert the absence of one or
// both signals (e.g. the fallback-to-"unknown" case).
function createCtx(
  ip: string | undefined,
  cfConnectingIp: string | undefined,
): {
  ctx: TrpcContext;
  setHeaderCalls: SetHeaderCall[];
} {
  const setHeaderCalls: SetHeaderCall[] = [];
  const headers: Record<string, string | string[] | undefined> = {};
  if (cfConnectingIp !== undefined) {
    headers["cf-connecting-ip"] = cfConnectingIp;
  }
  const ctx: TrpcContext = {
    user: null,
    req: {
      ip,
      protocol: "https",
      headers,
    } as unknown as TrpcContext["req"],
    res: {
      setHeader: (name: string, value: string) => {
        setHeaderCalls.push({ name, value });
      },
      // cookie + clearCookie are referenced by the success path of login
      // but never reached in the rate-limited tests.
      cookie: () => undefined,
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setHeaderCalls };
}

beforeEach(() => {
  mockedCheckRateLimit.mockReset();
  mockedGetUserByEmail.mockReset();
  mockedGetUserByEmail.mockResolvedValue(null);
});

describe("auth.login rate limiting", () => {
  it("calls checkRateLimit with the namespaced key and 10/15min policy (CF-Connecting-IP path)", async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
    const { ctx } = createCtx("104.21.1.2", "198.51.100.7");
    const caller = appRouter.createCaller(ctx);

    // Reaches past the rate limit and lands in the auth code, which
    // returns success:false because getUserByEmail is mocked to null.
    await caller.auth.login({ email: "x@example.com", password: "pw" });

    expect(mockedCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      // Production-shaped: CF-Connecting-IP wins over req.ip (which would
      // be a Cloudflare edge POP and therefore wrong).
      "login:198.51.100.7",
      10,
      15 * 60_000,
    );
  });

  it("falls back to req.ip when CF-Connecting-IP is missing (local dev shape)", async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
    const { ctx } = createCtx("127.0.0.1", undefined);
    const caller = appRouter.createCaller(ctx);

    await caller.auth.login({ email: "x@example.com", password: "pw" });

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      "login:127.0.0.1",
      10,
      15 * 60_000,
    );
  });

  it("throws TOO_MANY_REQUESTS with Retry-After header when over the limit", async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const { ctx, setHeaderCalls } = createCtx("104.21.1.2", "203.0.113.42");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "x@example.com", password: "pw" }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("login attempts"),
    });

    expect(setHeaderCalls).toContainEqual({
      name: "Retry-After",
      // 15 minutes = 900 seconds
      value: "900",
    });
  });

  it("falls back to a single 'unknown' bucket when both req.ip and CF-Connecting-IP are missing", async () => {
    // Defends against a future change to context.ts or the express stack
    // that would silently break IP extraction. Better to lump everyone
    // into one shared bucket (degraded but safe) than to give every
    // attacker an unlimited fresh bucket.
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
    const { ctx } = createCtx(undefined, undefined);
    const caller = appRouter.createCaller(ctx);

    await caller.auth.login({ email: "x@example.com", password: "pw" });

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      "login:unknown",
      10,
      15 * 60_000,
    );
  });
});

describe("auth.register rate limiting", () => {
  it("calls checkRateLimit with the namespaced key and 5/60min policy", async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
    const { ctx } = createCtx("104.21.1.2", "198.51.100.7");
    const caller = appRouter.createCaller(ctx);

    // Use a unique email so getUserByEmail (mocked → null) treats this
    // as a fresh signup. The rest of the register path needs DB writes
    // we've also mocked, so this should resolve cleanly.
    await caller.auth.register({
      name: "Test User",
      email: "newuser@example.com",
      password: "longenoughpw",
    });

    expect(mockedCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      "register:198.51.100.7",
      5,
      60 * 60_000,
    );
  });

  it("throws TOO_MANY_REQUESTS with Retry-After=3600 when over the limit", async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const { ctx, setHeaderCalls } = createCtx("104.21.1.2", "203.0.113.42");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        name: "Test",
        email: "t@example.com",
        password: "longenoughpw",
      }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("register attempts"),
    });

    expect(setHeaderCalls).toContainEqual({
      name: "Retry-After",
      // 60 minutes = 3600 seconds
      value: "3600",
    });
  });
});

describe("rate limit ordering — checked BEFORE the DB / bcrypt path", () => {
  it("does not touch getUserByEmail when login is over the limit", async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const { ctx } = createCtx("104.21.1.2", "203.0.113.42");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "x@example.com", password: "pw" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    // The DB lookup is the cheap proxy for "did we proceed past the
    // rate limit?". If this assertion ever fails, someone moved the
    // enforceRateLimit call to AFTER the DB lookup and we just lost
    // the DoS protection.
    expect(mockedGetUserByEmail).not.toHaveBeenCalled();
  });
});
