import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAuthDisableResolution,
  resetClientRuntimeConfigValidationForTests,
  resolveClientAuthConfig,
  validateClientRuntimeConfigOnce,
} from "./runtime-config";

describe("client runtime config resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetClientRuntimeConfigValidationForTests();
  });

  it("uses VITE_DISABLE_AUTH as canonical precedence over DISABLE_AUTH", () => {
    const resolution = getAuthDisableResolution({
      VITE_DISABLE_AUTH: "false",
      DISABLE_AUTH: "true",
    });
    expect(resolution.value).toBe(false);
    expect(resolution.source).toBe("VITE_DISABLE_AUTH");
    expect(resolution.contradiction).toBe(true);
  });

  it("warns on contradictory auth flags", () => {
    const warn = vi.fn();
    const config = resolveClientAuthConfig(
      {
        VITE_DISABLE_AUTH: "true",
        DISABLE_AUTH: "false",
        VITE_OAUTH_PORTAL_URL: "https://auth.example.com",
      },
      warn
    );
    expect(config.authDisabled).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "[AUTH] Conflicting auth flags detected; VITE_DISABLE_AUTH takes precedence",
      expect.any(Object)
    );
  });

  it("marks login unavailable when oauth portal URL missing and auth enabled", () => {
    const config = resolveClientAuthConfig({
      VITE_DISABLE_AUTH: "false",
      DISABLE_AUTH: "false",
      VITE_OAUTH_PORTAL_URL: "",
    });
    expect(config.canStartLoginFlow).toBe(false);
    expect(config.loginUnavailableReason).toBe("missing_oauth_portal_url");
  });

  it("marks login unavailable when oauth portal URL is malformed", () => {
    const config = resolveClientAuthConfig({
      VITE_DISABLE_AUTH: "false",
      DISABLE_AUTH: "false",
      VITE_OAUTH_PORTAL_URL: "://bad-url",
    });
    expect(config.canStartLoginFlow).toBe(false);
    expect(config.loginUnavailableReason).toBe("malformed_oauth_portal_url");
  });

  it("logs auth disabled only once during startup validation", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("VITE_DISABLE_AUTH", "true");
    validateClientRuntimeConfigOnce();
    validateClientRuntimeConfigOnce();

    const authLogs = infoSpy.mock.calls.filter(
      call => call[0] === "[AUTH] Disabled via environment flag"
    );
    expect(authLogs.length).toBe(1);
  });

  it("logs auth flag conflict only once during startup validation", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VITE_DISABLE_AUTH", "true");
    vi.stubEnv("DISABLE_AUTH", "false");
    validateClientRuntimeConfigOnce();
    validateClientRuntimeConfigOnce();

    const conflictLogs = warnSpy.mock.calls.filter(
      call => call[0] === "[AUTH] Conflicting auth flags detected; VITE_DISABLE_AUTH takes precedence"
    );
    expect(conflictLogs.length).toBe(1);
  });
});
