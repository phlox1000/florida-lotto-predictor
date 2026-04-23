import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getUserByEmail, createUser, getUserCount } from "../db";
import { checkRateLimit } from "../lib/rateLimiter";
import { getClientIp } from "../lib/clientIp";

/**
 * Per-IP rate limits applied BEFORE bcrypt on the auth mutations.
 *
 * Why before bcrypt:
 *   bcrypt.compare with cost=12 is ~250ms of CPU. An attacker hammering
 *   login with garbage credentials would consume one CPU-quarter-second
 *   per request even on a "failed login" path. Checking the limit first
 *   makes the rejection essentially free (one Redis INCR / one Map op),
 *   so a credential-stuffing flood costs them more than it costs us.
 *
 * Why count successes too (instead of "failed attempts only"):
 *   The "only count failures" pattern needs a second round-trip to refund
 *   the counter on success, and the resulting timing difference between
 *   success/failure doubles as an oracle. Counting all attempts is simpler
 *   and the legitimate-user cost is essentially zero — 10 logins per 15
 *   minutes from one IP is already an unusual amount of typo recovery.
 *
 * Limit values:
 *   login: 10/15min/IP — generous enough not to lock out a shared NAT
 *     (corporate office, mobile carrier) where many users share an IP.
 *     Tight enough that credential stuffing (which fires hundreds/sec)
 *     stops dead after the first 10 attempts.
 *   register: 5/60min/IP — tighter, because legitimate registration
 *     traffic on this app is essentially zero (single-user lotto app),
 *     so any volume here is signup spam.
 */
const LOGIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60_000 } as const;
const REGISTER_RATE_LIMIT = { max: 5, windowMs: 60 * 60_000 } as const;

// One-shot diagnostic that fires on the first rate-limited request after
// each pod start. Logs the full IP-resolution chain (CF header, req.ip,
// XFF) so a future trust-proxy / topology change is immediately visible
// in the logs without needing another forensic round-trip. The flag is
// per-process, so the noise is bounded to one line per pod-lifetime.
let hasLoggedIpTopologyOnce = false;

function createSessionUser(user: {
  openId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}) {
  return {
    openId: user.openId,
    name: user.name ?? "",
    email: user.email ?? null,
    role: user.role ?? "user",
  };
}

/**
 * Apply a rate limit to the current request and throw TRPCError on lockout.
 *
 * Sets the `Retry-After` HTTP header (in seconds) per RFC 6585 §4 so
 * well-behaved clients (curl, fetch with retry libs, monitoring tools)
 * know exactly how long to back off. The TRPCError code TOO_MANY_REQUESTS
 * maps to HTTP 429 in @trpc/server's status table.
 */
async function enforceRateLimit(
  ctx: {
    req: { ip?: string; headers: Record<string, string | string[] | undefined> };
    res: { setHeader: (name: string, value: string) => void };
  },
  scope: "login" | "register",
  policy: { max: number; windowMs: number },
): Promise<void> {
  // getClientIp prefers Cloudflare's CF-Connecting-IP over req.ip, which
  // is necessary on Render because *.onrender.com traffic is fronted by
  // Cloudflare's edge and req.ip resolves to a CF POP that varies per
  // request. See server/lib/clientIp.ts for the full topology rationale.
  const ip = getClientIp(ctx.req);

  if (!hasLoggedIpTopologyOnce) {
    console.log("[rateLimit] client IP topology:", {
      cfConnectingIp: ctx.req.headers["cf-connecting-ip"] ?? null,
      reqIp: ctx.req.ip ?? null,
      xff: ctx.req.headers["x-forwarded-for"] ?? null,
      chosen: ip,
    });
    hasLoggedIpTopologyOnce = true;
  }

  const key = `${scope}:${ip}`;
  const result = await checkRateLimit(key, policy.max, policy.windowMs);
  if (!result.allowed) {
    const retrySeconds = Math.ceil(policy.windowMs / 1000);
    ctx.res.setHeader("Retry-After", retrySeconds.toString());
    const retryMinutes = Math.ceil(retrySeconds / 60);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many ${scope} attempts. Please try again in about ${retryMinutes} minute${retryMinutes === 1 ? "" : "s"}.`,
    });
  }
}

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  register: publicProcedure
    .input(z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Invalid email"),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rate limit BEFORE the DB lookup + bcrypt hash, so a register-spam
      // flood doesn't get to consume those resources per attempt.
      await enforceRateLimit(ctx, "register", REGISTER_RATE_LIMIT);

      const existing = await getUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const count = await getUserCount();
      const role = count === 0 ? "admin" : "user";
      const openId = crypto.randomUUID();

      await createUser({
        openId,
        name: input.name,
        email: input.email,
        passwordHash,
        passwordSalt: null,
        role,
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: input.name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return {
        success: true as const,
        sessionToken,
        user: createSessionUser({
          openId,
          name: input.name,
          email: input.email,
          role,
        }),
      };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rate limit BEFORE the DB lookup + bcrypt compare, so credential
      // stuffing pays the cost of being told to back off rather than
      // consuming a CPU-quarter-second per garbage attempt.
      await enforceRateLimit(ctx, "login", LOGIN_RATE_LIMIT);

      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        return { success: false as const, message: "Invalid email or password" };
      }

      const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordMatch) {
        return { success: false as const, message: "Invalid email or password" };
      }

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log('[auth.login] returning:', {
        hasSessionToken: !!sessionToken,
        sessionTokenLength: sessionToken?.length,
        userId: user?.id,
        openIdLength: user?.openId?.length,
        openIdTrimmed: user?.openId?.trim().length,
      });

      return {
        success: true as const,
        sessionToken,
        user: createSessionUser(user),
      };
    }),
});
