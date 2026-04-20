/**
 * Fixed-window request rate limiter.
 *
 * Backend:
 *   - If REDIS_URL is configured, state lives in Redis under keys of the
 *     form `rl:{ip}:{bucket}` with a TTL equal to the window. This is the
 *     correct backend for multi-pod deployments because every pod sees the
 *     same counter.
 *   - Otherwise, state lives in a process-local Map. This path exists so
 *     local dev and unit tests don't need a running Redis. It is not safe
 *     for multi-pod production — each pod has its own independent counter,
 *     so the effective limit is maxRequests × numInstances.
 *
 * Algorithm (fixed window):
 *   bucket = floor(now / windowMs)
 *   key    = `rl:{ip}:{bucket}`
 *   INCR key; if count == 1 then PEXPIRE key windowMs
 *   allowed iff count <= maxRequests
 *
 * Known edge case: an attacker can burst up to 2×maxRequests across a
 * bucket boundary (maxRequests at windowMs-ε, then maxRequests at
 * windowMs+ε). This matches the behavior of the original in-memory
 * implementation and is the standard fixed-window trade-off. Moving to a
 * sliding window would cost an extra Redis round-trip or a Lua script; if
 * we need that precision we should do it in a dedicated PR with load tests.
 *
 * Zero callers today. This file exists so the store is multi-pod-safe
 * before anyone starts wiring rate limits onto routes. See PR body for
 * the call-site follow-ups (login, admin "Run Now", etc.).
 */

import { getRedisClient } from "./redis";

export interface RateLimitResult {
  /** Whether this request should be served. false → respond 429. */
  allowed: boolean;
  /** Requests remaining in the current window. Never negative. */
  remaining: number;
}

// In-memory fallback state. Module-level so multiple calls within a process
// share the same Map. Never read when Redis is available.
const memCounters = new Map<string, { count: number; windowStart: number }>();

// Lazy-started cleanup timer for the in-memory fallback. We don't want to
// spawn an interval on module load (which would keep the Node event loop
// alive during `vitest run` even when no test touches this file and make
// process exit slow); instead, start it only when we actually put something
// in the Map, and keep it running for the process lifetime.
let memCleanupInterval: ReturnType<typeof setInterval> | null = null;
const MEM_CLEANUP_MS = 300_000;
function ensureMemCleanupScheduled() {
  if (memCleanupInterval) return;
  memCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of memCounters.entries()) {
      // Evict entries whose window ended more than one cleanup interval ago.
      // Any stricter and we'd race an in-flight request reading the entry.
      if (now - entry.windowStart > MEM_CLEANUP_MS) memCounters.delete(ip);
    }
  }, MEM_CLEANUP_MS);
  // Don't hold the event loop open for this timer alone.
  if (typeof memCleanupInterval.unref === "function") {
    memCleanupInterval.unref();
  }
}

/**
 * Record and evaluate a request from `ip`. Returns whether the request is
 * within the limit and how many calls remain in the current window.
 *
 * Defaults (10 req / 60s) match the original in-memory implementation so
 * any future call-site wiring doesn't need to re-tune against behavior
 * change.
 */
export async function checkRateLimit(
  ip: string,
  maxRequests: number = 10,
  windowMs: number = 60_000,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (redis) {
    try {
      // Bucket the key by window so TTL cleanup is automatic and windows
      // don't leak state across boundaries.
      const bucket = Math.floor(Date.now() / windowMs);
      const key = `rl:${ip}:${bucket}`;

      // INCR returns the new value. On first hit we also set the TTL;
      // subsequent hits inherit it. Doing INCR first lets us use the
      // returned count directly without a second GET round-trip.
      const count = await redis.incr(key);
      if (count === 1) {
        // PEXPIRE takes milliseconds, matching windowMs exactly. Using
        // EXPIRE with Math.ceil(windowMs / 1000) would round up to a full
        // second and loosen short windows noticeably (e.g. a 250ms window
        // would become 1000ms — a 4x relaxation).
        await redis.pexpire(key, windowMs);
      }

      const remaining = Math.max(0, maxRequests - count);
      return { allowed: count <= maxRequests, remaining };
    } catch (err) {
      // Redis is unreachable or the command failed. Policy: fail OPEN for
      // availability. The alternative (fail closed → 429 on everything
      // during a Redis outage) would turn a cache outage into a full
      // site outage, which is almost never what you want from a rate
      // limiter. Log so the operator can see it.
      console.error("[rateLimit] redis error, allowing request:", (err as Error).message);
      return { allowed: true, remaining: maxRequests - 1 };
    }
  }

  // In-memory fallback. Same semantics as Redis path: fixed window, INCR
  // on first hit initializes windowStart, subsequent hits bump count.
  ensureMemCleanupScheduled();
  const now = Date.now();
  const entry = memCounters.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    memCounters.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

/**
 * Test helper. Clears the in-memory counters and stops the cleanup timer so
 * each test starts from a known state without leaking across the suite.
 */
export function __resetForTests(): void {
  memCounters.clear();
  if (memCleanupInterval) {
    clearInterval(memCleanupInterval);
    memCleanupInterval = null;
  }
}
