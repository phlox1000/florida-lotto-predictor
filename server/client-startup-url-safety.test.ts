import { beforeEach, describe, expect, it, vi } from "vitest";

function setupDom(origin: string) {
  vi.stubGlobal("window", {
    location: {
      origin,
    },
  } as any);
}

describe("client startup URL safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    setupDom("https://florida-lotto-predictor.onrender.com");
  });

  it("does not throw when oauth portal env is missing", async () => {
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "false");
    const mod = await import("../client/src/const");
    expect(() => mod.getLoginUrl()).not.toThrow();
    expect(mod.getLoginUrl()).toContain("/app-auth");
  });

  it("does not throw when oauth portal env is malformed", async () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "://bad-url");
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "false");
    const mod = await import("../client/src/const");
    expect(() => mod.getLoginUrl()).not.toThrow();
    const url = mod.getLoginUrl();
    expect(url).toContain("https://florida-lotto-predictor.onrender.com/app-auth");
    expect(url).toContain("redirectUri=");
  });

  it("bypasses OAuth URL construction when auth is disabled", async () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "://bad-url");
    vi.stubEnv("VITE_DISABLE_AUTH", "true");
    const mod = await import("../client/src/const");
    expect(mod.getLoginUrl()).toBe("/");
  });

  it("also bypasses OAuth URL construction with DISABLE_AUTH compatibility flag", async () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "://bad-url");
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "true");
    const mod = await import("../client/src/const");
    expect(mod.getLoginUrl()).toBe("/");
  });

  it("handles relative auth path values safely", async () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "/oauth");
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "false");
    const mod = await import("../client/src/const");
    const url = mod.getLoginUrl();
    expect(url).toContain("https://florida-lotto-predictor.onrender.com/app-auth");
    expect(url).toContain("redirectUri=");
  });

  it("valid env still produces expected URL", async () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://auth.example.com");
    vi.stubEnv("VITE_APP_ID", "app-123");
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "false");
    const mod = await import("../client/src/const");
    const url = mod.getLoginUrl();
    expect(url.startsWith("https://auth.example.com/app-auth?")).toBe(true);
    expect(url).toContain("appId=app-123");
    expect(url).toContain("type=signIn");
  });

  it("useAuth startup path is safe when auth is disabled", async () => {
    vi.stubEnv("VITE_DISABLE_AUTH", "true");
    vi.stubEnv("DISABLE_AUTH", "false");
    const hook = await import("../client/src/_core/hooks/useAuth");
    expect(typeof hook.useAuth).toBe("function");
  });

  it("redirect path resolver does not compute oauth url when auth is disabled", async () => {
    vi.stubEnv("VITE_DISABLE_AUTH", "true");
    vi.stubEnv("DISABLE_AUTH", "false");
    const hook = await import("../client/src/_core/hooks/useAuth");
    expect(hook.resolveAuthRedirectPath(undefined, true)).toBe("/");
  });
});
