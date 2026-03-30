import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

let authDisabledContextLogged = false;

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function buildMockUser(): User {
  const now = new Date();
  const mockOpenId = process.env.MOCK_USER_OPENID || "mock-user";
  return {
    id: Number(process.env.MOCK_USER_ID || 1),
    openId: mockOpenId,
    name: process.env.MOCK_USER_NAME || "Mock User",
    email: process.env.MOCK_USER_EMAIL || "mock@example.com",
    loginMethod: "mock",
    role: process.env.MOCK_USER_ROLE === "admin" ? "admin" : "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  if (ENV.disableAuth) {
    if (!authDisabledContextLogged) {
      authDisabledContextLogged = true;
      console.info("[AUTH] Disabled via environment flag", {
        source: "DISABLE_AUTH",
        context: "trpc.createContext",
      });
    }
    const mockUser = buildMockUser();
    const hasSessionCookie = (opts.req.headers.cookie || "")
      .split(";")
      .map(part => part.trim())
      .some(part => part.startsWith(`${COOKIE_NAME}=`));

    if (!hasSessionCookie) {
      // Keep downstream auth shape stable by issuing a normal signed session cookie.
      const sessionToken = await sdk.createSessionToken(mockUser.openId, {
        name: mockUser.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(opts.req);
      opts.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
    }

    return {
      req: opts.req,
      res: opts.res,
      user: mockUser,
    };
  }

  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
