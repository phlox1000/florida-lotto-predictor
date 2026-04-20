/**
 * Lazy-singleton Redis client.
 *
 * Design goals:
 *
 *   1. Zero behavior change when REDIS_URL is unset. Callers get `null` back
 *      and are expected to fall through to an in-process fallback (e.g. the
 *      in-memory Map in rateLimiter.ts). This preserves local-dev ergonomics:
 *      no one has to run a Redis locally to work on unrelated features.
 *
 *   2. One TCP connection per pod. ioredis handles its own pipelining and
 *      reconnection, so a module-level singleton is the right pattern here.
 *      Creating a fresh client per request would explode the Render Key Value
 *      free tier's 50-connection cap under even modest traffic.
 *
 *   3. Import this file is free. The client is not constructed until the
 *      first `getRedisClient()` call, so modules that import this file but
 *      never call it (e.g. dead-code paths, test runs without REDIS_URL) pay
 *      only the require cost of ioredis itself.
 *
 *   4. Connection failures must not crash the pod. A flaky Redis should
 *      degrade functionality (e.g. weaker rate limiting) rather than take
 *      the web service offline. `error` events are logged and swallowed;
 *      ioredis will keep attempting reconnects via retryStrategy below.
 *
 * Not done here (deliberately):
 *   - No pub/sub helpers. Add when we have a first caller.
 *   - No `SELECT db` support. Render Key Value is single-db.
 *   - No TLS tweaking. Render's REDIS_URL scheme (`rediss://`) is honored
 *     automatically by ioredis' URL parser.
 */

import Redis, { type Redis as RedisType } from "ioredis";

let clientInstance: RedisType | null = null;
let hasLoggedFallbackWarning = false;

/**
 * Return a shared ioredis client, or null if REDIS_URL is not configured.
 *
 * Null is the contract for "no Redis available". Callers must handle it;
 * see rateLimiter.ts for the canonical fallback pattern.
 */
export function getRedisClient(): RedisType | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    // Log once per process so local dev isn't spammed, but the operator of a
    // misconfigured prod pod still sees the warning on startup's first hit.
    if (!hasLoggedFallbackWarning) {
      console.log(
        "[redis] REDIS_URL not set, using in-memory fallbacks. " +
          "This is expected in local dev; in prod it means rate limits are per-pod.",
      );
      hasLoggedFallbackWarning = true;
    }
    return null;
  }

  if (clientInstance) return clientInstance;

  clientInstance = new Redis(url, {
    // Fail fast on transient errors so a down-Redis doesn't silently stall
    // request handlers for seconds. 3 × 200ms = ~600ms worst-case per call.
    maxRetriesPerRequest: 3,

    // Exponential backoff with a 2s cap. ioredis calls this on disconnect
    // to decide when to reconnect. A tight cap keeps us responsive after a
    // network blip without hammering Redis on a prolonged outage.
    retryStrategy: (times: number) => Math.min(times * 200, 2000),

    // ioredis' default is to block commands until the first READY event,
    // which serializes our whole process behind the initial handshake.
    // Explicit 5s connect timeout turns a misconfigured URL into a loud,
    // fast failure instead of a hang.
    connectTimeout: 5000,
  });

  clientInstance.on("connect", () => {
    console.log("[redis] connected");
  });

  // Logged but NOT thrown. ioredis will attempt reconnection; downstream
  // callers should check for null (they won't get it) or accept that a
  // command may reject under a sustained outage, and fall back accordingly.
  clientInstance.on("error", err => {
    console.error("[redis] client error:", err.message);
  });

  return clientInstance;
}

/**
 * Gracefully close the shared client. Intended for test teardown; the web
 * and cron processes exit without calling this (the OS cleans up sockets).
 */
export async function closeRedisClient(): Promise<void> {
  if (!clientInstance) return;
  const c = clientInstance;
  clientInstance = null;
  try {
    await c.quit();
  } catch {
    // QUIT can reject if the connection is already dead — that's fine, we
    // were closing it anyway.
  }
}

/**
 * Test helper. Resets the singleton so a new call to getRedisClient() after
 * a `process.env.REDIS_URL` change will build a fresh client. Also resets
 * the one-time warning flag so tests can assert the log.
 */
export function __resetForTests(): void {
  clientInstance = null;
  hasLoggedFallbackWarning = false;
}
