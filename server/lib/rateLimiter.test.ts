/**
 * Unit tests for checkRateLimit.
 *
 * Covers both backends by mocking `./redis::getRedisClient`:
 *   - Returning null exercises the in-memory Map fallback.
 *   - Returning a fake ioredis stub exercises the Redis code path without
 *     needing a live Redis (which would make CI flaky).
 *
 * We use fake timers so window-expiry assertions are deterministic: real
 * `Date.now()` plus a `setTimeout(windowMs)` would force tests to actually
 * wait and turn this into an integration suite.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./redis", () => ({
  getRedisClient: vi.fn(),
}));

import { checkRateLimit, __resetForTests } from "./rateLimiter";
import { getRedisClient } from "./redis";

const mockedGetRedisClient = getRedisClient as unknown as ReturnType<typeof vi.fn>;

describe("checkRateLimit — in-memory fallback (REDIS_URL unset)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
    mockedGetRedisClient.mockReturnValue(null);
    __resetForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    mockedGetRedisClient.mockReset();
  });

  it("allows the first request and reports correct remaining", async () => {
    const result = await checkRateLimit("1.2.3.4", 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("allows up to maxRequests then denies", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit("1.2.3.4", 3, 60_000));
    }

    expect(results[0]).toEqual({ allowed: true, remaining: 2 });
    expect(results[1]).toEqual({ allowed: true, remaining: 1 });
    expect(results[2]).toEqual({ allowed: true, remaining: 0 });
    // 4th request over the limit: denied, remaining stays at 0.
    expect(results[3]).toEqual({ allowed: false, remaining: 0 });
  });

  it("resets the counter after the window elapses", async () => {
    // Fill the bucket to the max.
    for (let i = 0; i < 3; i++) await checkRateLimit("1.2.3.4", 3, 60_000);
    const denied = await checkRateLimit("1.2.3.4", 3, 60_000);
    expect(denied.allowed).toBe(false);

    // Advance just past the window. Next call should start a fresh window.
    vi.advanceTimersByTime(60_001);

    const afterReset = await checkRateLimit("1.2.3.4", 3, 60_000);
    expect(afterReset).toEqual({ allowed: true, remaining: 2 });
  });

  it("tracks different IPs independently", async () => {
    // Burn through one IP's budget.
    for (let i = 0; i < 3; i++) await checkRateLimit("1.1.1.1", 3, 60_000);
    const ip1Denied = await checkRateLimit("1.1.1.1", 3, 60_000);
    expect(ip1Denied.allowed).toBe(false);

    // A different IP is unaffected.
    const ip2 = await checkRateLimit("2.2.2.2", 3, 60_000);
    expect(ip2).toEqual({ allowed: true, remaining: 2 });
  });
});

describe("checkRateLimit — Redis backend", () => {
  // Minimal ioredis stub: just enough surface for rateLimiter.ts.
  // We model the observable behavior, not Redis internals, because the
  // test is about OUR code's correctness against a compliant Redis, not
  // Redis' own semantics.
  let fakeStore: Map<string, { count: number; expiresAt: number }>;
  let pexpireCalls: Array<{ key: string; ttl: number }>;
  let incr: (key: string) => Promise<number>;
  let pexpire: (key: string, ttl: number) => Promise<number>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
    __resetForTests();

    fakeStore = new Map();
    pexpireCalls = [];

    incr = vi.fn(async (key: string) => {
      const now = Date.now();
      const entry = fakeStore.get(key);
      // Expired keys are treated as absent (mimics Redis TTL eviction).
      if (!entry || entry.expiresAt <= now) {
        fakeStore.set(key, { count: 1, expiresAt: Number.POSITIVE_INFINITY });
        return 1;
      }
      entry.count++;
      return entry.count;
    });

    pexpire = vi.fn(async (key: string, ttl: number) => {
      pexpireCalls.push({ key, ttl });
      const entry = fakeStore.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + ttl;
      return 1;
    });

    mockedGetRedisClient.mockReturnValue({ incr, pexpire });
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedGetRedisClient.mockReset();
  });

  it("allows requests under the limit and reports remaining", async () => {
    const first = await checkRateLimit("1.2.3.4", 3, 60_000);
    expect(first).toEqual({ allowed: true, remaining: 2 });

    const second = await checkRateLimit("1.2.3.4", 3, 60_000);
    expect(second).toEqual({ allowed: true, remaining: 1 });
  });

  it("sets PEXPIRE on the first hit only", async () => {
    await checkRateLimit("1.2.3.4", 5, 60_000);
    await checkRateLimit("1.2.3.4", 5, 60_000);
    await checkRateLimit("1.2.3.4", 5, 60_000);

    // PEXPIRE should only fire once per bucket — re-setting it on every
    // request would push the window forward and turn the fixed-window
    // limit into an always-refreshed one.
    expect(pexpireCalls).toHaveLength(1);
    expect(pexpireCalls[0].ttl).toBe(60_000);
  });

  it("denies once count exceeds maxRequests", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit("1.2.3.4", 3, 60_000));
    }
    expect(results[2].allowed).toBe(true);
    expect(results[3].allowed).toBe(false);
    expect(results[3].remaining).toBe(0);
  });

  it("uses bucketed keys so window rollover is automatic", async () => {
    await checkRateLimit("1.2.3.4", 3, 60_000);

    // Grab the key that was written.
    const firstKeys = Array.from(fakeStore.keys());
    expect(firstKeys).toHaveLength(1);

    // Advance past one window. The algorithm uses floor(now/windowMs) so
    // the next call should land in a different bucket → different key.
    vi.advanceTimersByTime(60_000);
    await checkRateLimit("1.2.3.4", 3, 60_000);

    const allKeys = Array.from(fakeStore.keys());
    expect(allKeys).toHaveLength(2);
    expect(allKeys[0]).not.toEqual(allKeys[1]);
  });

  it("fails open when Redis throws, for availability", async () => {
    (incr as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await checkRateLimit("1.2.3.4", 3, 60_000);

    // Fail-open: the request is allowed through. The alternative (fail
    // closed → blanket 429) would turn a Redis outage into a full site
    // outage, which is rarely desirable for a rate limiter.
    expect(result.allowed).toBe(true);
  });
});
