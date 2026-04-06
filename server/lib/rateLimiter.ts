/**
 * Simple in-memory rate limiter.
 * Tracks request counts per IP per window.
 * Resets counts after the window expires.
 * Not suitable for multi-instance deployments — this app runs on a single Render instance.
 */
const requestCounts = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(
  ip: string,
  maxRequests: number = 10,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

/** Periodically clean up stale entries to prevent memory growth */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts.entries()) {
    if (now - entry.windowStart > 300_000) requestCounts.delete(ip);
  }
}, 300_000);
