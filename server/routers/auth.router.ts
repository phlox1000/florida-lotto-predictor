import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getUserByEmail, createUser, getUserCount } from "../db";

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

      return { success: true as const };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
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

      return { success: true as const };
    }),
});
