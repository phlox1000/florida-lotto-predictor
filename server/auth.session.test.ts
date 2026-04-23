import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Request } from "express";
import { COOKIE_NAME } from "@shared/const";

vi.mock("./db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

let sdk!: typeof import("./_core/sdk").sdk;
let getUserByOpenId: ReturnType<typeof vi.fn>;
let upsertUser: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  process.env.JWT_SECRET = "vitest-session-secret-key-32-chars!!";
  process.env.VITE_APP_ID = "test-app-id";
  vi.resetModules();
  const sdkMod = await import("./_core/sdk");
  sdk = sdkMod.sdk;
  const db = await import("./db");
  getUserByOpenId = db.getUserByOpenId as ReturnType<typeof vi.fn>;
  upsertUser = db.upsertUser as ReturnType<typeof vi.fn>;
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
});

const minimalUser = {
  id: 1,
  openId: "openid-1",
  name: "",
  email: "a@example.com",
  loginMethod: null,
  passwordHash: "h",
  passwordSalt: null,
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("session verification", () => {
  it("allows JWT round-trip when display name is empty", async () => {
    const token = await sdk.createSessionToken("openid-1", { name: "" });
    const session = await sdk.verifySession(token);
    expect(session).toEqual({
      openId: "openid-1",
      appId: "test-app-id",
      name: "",
    });
  });

  it("getRequestSessionToken prefers cookie then Bearer", () => {
    const tok = "abc";
    const withCookie = {
      headers: { cookie: `${COOKIE_NAME}=${tok}` },
    } as unknown as Request;
    expect(sdk.getRequestSessionToken(withCookie)).toBe(tok);

    const withBearer = {
      headers: { authorization: `Bearer ${tok}` },
    } as unknown as Request;
    expect(sdk.getRequestSessionToken(withBearer)).toBe(tok);

    expect(
      sdk.getRequestSessionToken({
        headers: {
          cookie: `${COOKIE_NAME}=from-cookie`,
          authorization: "Bearer from-bearer",
        },
      } as unknown as Request),
    ).toBe("from-cookie");
  });

  it("authenticateOptionalRequest resolves user when session and db row exist", async () => {
    getUserByOpenId.mockResolvedValue(minimalUser);
    upsertUser.mockResolvedValue(undefined);
    const token = await sdk.createSessionToken("openid-1", { name: "" });
    const req = {
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    } as unknown as Request;

    const user = await sdk.authenticateOptionalRequest(req);
    expect(user).toMatchObject({ openId: "openid-1" });
    expect(upsertUser).toHaveBeenCalled();
  });

  it("authenticateOptionalRequest returns null when there is no session", async () => {
    const req = { headers: {} } as unknown as Request;
    await expect(sdk.authenticateOptionalRequest(req)).resolves.toBeNull();
    expect(getUserByOpenId).not.toHaveBeenCalled();
  });
});

describe("JWT secret guard", () => {
  it("throws in production when JWT_SECRET is missing", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJwt = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      vi.resetModules();
      const { sdk: prodSdk } = await import("./_core/sdk");
      await expect(prodSdk.createSessionToken("x")).rejects.toThrow(
        /JWT_SECRET is required in production/,
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.JWT_SECRET = originalJwt ?? "";
      vi.resetModules();
    }
  });
});
