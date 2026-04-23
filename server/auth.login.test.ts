import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ── Stable mock handles (created before vi.mock factories run) ─────────────────
// vi.hoisted ensures these fn references are available when the vi.mock()
// factory closures below execute (which are hoisted before import statements).

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  getUserCount: vi.fn(),
  createUser: vi.fn(),
  bcryptCompare: vi.fn(),
  bcryptHash: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getUserByEmail: mocks.getUserByEmail,
  getUserCount: mocks.getUserCount,
  createUser: mocks.createUser,
}));

vi.mock("./lib/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9 }),
}));

// The router imports bcrypt as: import bcrypt from "bcryptjs"
// Then calls bcrypt.compare() and bcrypt.hash() — both on the default export.
vi.mock("bcryptjs", () => ({
  default: {
    compare: mocks.bcryptCompare,
    hash: mocks.bcryptHash,
  },
}));

// ── App router handle (populated in beforeAll after vi.resetModules) ──────────

let appRouter: typeof import("./routers").appRouter;

beforeAll(async () => {
  // Set env vars BEFORE importing any module in the chain. ENV.cookieSecret
  // in server/_core/env.ts is captured at module load time, so the import
  // must happen after these are set.
  process.env.JWT_SECRET = "vitest-login-secret-key-32-chars!!";
  process.env.VITE_APP_ID = "test-app-id";

  // Clear the module cache so env.ts re-executes with the new JWT_SECRET.
  // vi.mock() registrations are NOT affected by resetModules().
  vi.resetModules();

  const routerMod = await import("./routers");
  appRouter = routerMod.appRouter;
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_OPEN_ID = "550e8400-e29b-41d4-a716-446655440000";

const mockDbUser = {
  id: 1,
  openId: MOCK_OPEN_ID,
  name: "Test User",
  email: "test@example.com",
  passwordHash: "$2b$12$mockedHashValue",
  passwordSalt: null,
  role: "user" as const,
  loginMethod: "email",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function makeCtx(overrides?: Partial<TrpcContext>): TrpcContext {
  return {
    user: null,
    req: {
      ip: "127.0.0.1",
      protocol: "https",
      headers: {
        "cf-connecting-ip": "127.0.0.1",
        "x-forwarded-for": "127.0.0.1",
      },
    } as unknown as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

// ── auth.login ────────────────────────────────────────────────────────────────

describe("auth.login", () => {
  it("returns sessionToken and user on valid credentials", async () => {
    mocks.getUserByEmail.mockResolvedValue(mockDbUser);
    mocks.bcryptCompare.mockResolvedValue(true);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      email: "test@example.com",
      password: "correct-password",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("narrowing");

    // sessionToken must be a non-empty JWT string
    expect(typeof result.sessionToken).toBe("string");
    expect(result.sessionToken.split(".")).toHaveLength(3); // header.payload.signature

    // user shape must satisfy normalizeSessionUser in the mobile client
    expect(result.user).toMatchObject({
      openId: MOCK_OPEN_ID,
      name: "Test User",
      email: "test@example.com",
      role: "user",
    });

    // Server must also set the web cookie for dual-client support
    expect(ctx.res.cookie).toHaveBeenCalledOnce();
  });

  it("returns success:false for wrong password without sessionToken", async () => {
    mocks.getUserByEmail.mockResolvedValue(mockDbUser);
    mocks.bcryptCompare.mockResolvedValue(false);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      email: "test@example.com",
      password: "wrong-password",
    });

    expect(result.success).toBe(false);
    // sessionToken must be absent — mobile client checks !result.sessionToken
    expect((result as Record<string, unknown>).sessionToken).toBeUndefined();
    expect(ctx.res.cookie).not.toHaveBeenCalled();
  });

  it("returns success:false when user not found", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      email: "nobody@example.com",
      password: "any-password",
    });

    expect(result.success).toBe(false);
    expect((result as Record<string, unknown>).sessionToken).toBeUndefined();
  });

  it("returns success:false when user has no passwordHash (OAuth-only account)", async () => {
    mocks.getUserByEmail.mockResolvedValue({ ...mockDbUser, passwordHash: null });

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      email: "test@example.com",
      password: "any-password",
    });

    expect(result.success).toBe(false);
  });

  it("openId in returned user is a non-empty string (normalizeSessionUser guard)", async () => {
    mocks.getUserByEmail.mockResolvedValue(mockDbUser);
    mocks.bcryptCompare.mockResolvedValue(true);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      email: "test@example.com",
      password: "correct-password",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("narrowing");

    // openId must pass the mobile client's normalizeSessionUser check:
    //   typeof value.openId === 'string' && value.openId.trim().length > 0
    expect(typeof result.user.openId).toBe("string");
    expect(result.user.openId.trim().length).toBeGreaterThan(0);
  });
});

// ── auth.register ─────────────────────────────────────────────────────────────

describe("auth.register", () => {
  it("returns sessionToken and user on successful registration", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined); // email not taken
    mocks.getUserCount.mockResolvedValue(1);           // not first user → role=user
    mocks.bcryptHash.mockResolvedValue("$2b$12$hashed");
    mocks.createUser.mockResolvedValue(undefined);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.register({
      name: "New User",
      email: "new@example.com",
      password: "securepassword123",
    });

    expect(result.success).toBe(true);

    expect(typeof result.sessionToken).toBe("string");
    expect(result.sessionToken.split(".")).toHaveLength(3);

    expect(result.user).toMatchObject({
      name: "New User",
      email: "new@example.com",
      role: "user",
    });
    expect(typeof result.user.openId).toBe("string");
    expect(result.user.openId.trim().length).toBeGreaterThan(0);

    expect(ctx.res.cookie).toHaveBeenCalledOnce();
  });

  it("first registered user gets admin role", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    mocks.getUserCount.mockResolvedValue(0); // first user → role=admin
    mocks.bcryptHash.mockResolvedValue("$2b$12$hashed");
    mocks.createUser.mockResolvedValue(undefined);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.register({
      name: "Admin User",
      email: "admin@example.com",
      password: "securepassword123",
    });

    expect(result.success).toBe(true);
    expect(result.user.role).toBe("admin");
  });

  it("throws CONFLICT when email is already registered", async () => {
    mocks.getUserByEmail.mockResolvedValue(mockDbUser); // email taken

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        name: "Duplicate",
        email: "test@example.com",
        password: "somepassword",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(ctx.res.cookie).not.toHaveBeenCalled();
  });
});

// ── auth.logout ───────────────────────────────────────────────────────────────

describe("auth.logout (cookie dual-client)", () => {
  it("clears the session cookie for web clients", async () => {
    const ctx = makeCtx({
      user: mockDbUser,
    });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledOnce();
  });
});
