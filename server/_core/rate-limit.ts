import type { Request } from "express";

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";
  return trimmed.replace(/^::ffff:/, "");
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0];
    return normalizeIp(first);
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return normalizeIp(forwarded[0] || "");
  }
  return normalizeIp(req.socket?.remoteAddress || "");
}

export function checkRateLimit(params: {
  scope: string;
  req: Request;
  max: number;
  windowMs: number;
}): {
  allowed: boolean;
  retryAfterSeconds: number;
  key: string;
} {
  const now = Date.now();
  const ip = getClientIp(params.req);
  const key = `${params.scope}:${ip}`;
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + params.windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      key,
    };
  }

  if (existing.count >= params.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      key,
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  // Lightweight cleanup to avoid unbounded map growth.
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    key,
  };
}
