import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("attemptLoginRedirect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    toastError.mockReset();
    vi.stubGlobal("window", {
      location: {
        origin: "https://florida-lotto-predictor.onrender.com",
        href: "https://florida-lotto-predictor.onrender.com/",
      },
    } as any);
  });

  it("shows graceful message and does not navigate when oauth config missing", async () => {
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "false");
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "");
    const mod = await import("./auth-login");

    const didRedirect = mod.attemptLoginRedirect();

    expect(didRedirect).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      "Sign-in is currently unavailable. Please try again later."
    );
    expect((window as any).location.href).toBe(
      "https://florida-lotto-predictor.onrender.com/"
    );
  });

  it("navigates with valid oauth config", async () => {
    vi.stubEnv("VITE_DISABLE_AUTH", "false");
    vi.stubEnv("DISABLE_AUTH", "false");
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://auth.example.com");
    const mod = await import("./auth-login");

    const didRedirect = mod.attemptLoginRedirect();

    expect(didRedirect).toBe(true);
    expect((window as any).location.href).toContain("https://auth.example.com/app-auth");
    expect(toastError).not.toHaveBeenCalled();
  });
});
