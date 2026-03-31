import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSessionTokenMock, cookieMock } = vi.hoisted(() => ({
  createSessionTokenMock: vi.fn(),
  cookieMock: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: createSessionTokenMock,
    authenticateRequest: vi.fn(),
  },
}));

describe("createContext with DISABLE_AUTH", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("continues with mock user when session token issuance fails", async () => {
    vi.stubEnv("DISABLE_AUTH", "true");
    createSessionTokenMock.mockRejectedValueOnce(
      new Error("Zero-length key is not supported")
    );

    const { createContext } = await import("./_core/context");

    const req = { headers: {} } as any;
    const res = { cookie: cookieMock } as any;
    const ctx = await createContext({ req, res } as any);

    expect(ctx.user).not.toBeNull();
    expect(ctx.user?.openId).toBe("mock-user");
    expect(ctx.user?.role).toBe("admin");
    expect(createSessionTokenMock).toHaveBeenCalledTimes(1);
  });

  it("defaults diagnostic mock role to admin when unset", async () => {
    vi.stubEnv("DISABLE_AUTH", "true");

    const { createContext } = await import("./_core/context");
    const req = { headers: {} } as any;
    const res = { cookie: cookieMock } as any;
    const ctx = await createContext({ req, res } as any);

    expect(ctx.user?.role).toBe("admin");
  });

  it("honors explicit diagnostic mock role override to user", async () => {
    vi.stubEnv("DISABLE_AUTH", "true");
    vi.stubEnv("MOCK_USER_ROLE", "user");

    const { createContext } = await import("./_core/context");
    const req = { headers: {} } as any;
    const res = { cookie: cookieMock } as any;
    const ctx = await createContext({ req, res } as any);

    expect(ctx.user?.role).toBe("user");
  });
});
