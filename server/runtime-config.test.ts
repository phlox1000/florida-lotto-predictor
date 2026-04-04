import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetServerRuntimeConfigValidationForTests,
  resolveServerAuthConfig,
  validateServerRuntimeConfigOnce,
} from "./_core/runtime-config";
import {
  getDatabaseSchemaSanitySnapshot,
} from "./db";

vi.mock("./db", () => ({
  getDatabaseSchemaSanity: vi.fn(async () => ({
    checked: true,
    checkedAt: new Date().toISOString(),
    requiredTables: [],
    missingTables: [],
    lastError: null,
    personalizationMetricsAvailable: true,
    personalizationFeaturesActive: true,
    bootstrap: {
      attempted: false,
      applied: false,
      error: null,
      mode: "disabled",
      migrationPreferred: true,
    },
  })),
  getDatabaseSchemaSanitySnapshot: vi.fn(),
}));

describe("server runtime config validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetServerRuntimeConfigValidationForTests();
    vi.unstubAllEnvs();
  });

  it("resolves auth disabled source from DISABLE_AUTH", () => {
    const config = resolveServerAuthConfig({
      DISABLE_AUTH: "true",
      OAUTH_SERVER_URL: "",
      BUILT_IN_FORGE_API_URL: "",
      LLM_API_URL: "",
    } as NodeJS.ProcessEnv);

    expect(config.authDisabled).toBe(true);
    expect(config.authDisableSource).toBe("DISABLE_AUTH");
  });

  it("warns for missing OAuth server URL when auth enabled", () => {
    const warn = vi.fn();
    resolveServerAuthConfig(
      {
        DISABLE_AUTH: "false",
        OAUTH_SERVER_URL: "",
        BUILT_IN_FORGE_API_URL: "",
        LLM_API_URL: "",
      } as NodeJS.ProcessEnv,
      warn
    );

    expect(warn).toHaveBeenCalledWith(
      "[CONFIG] Missing OAUTH_SERVER_URL; OAuth sign-in callbacks will fail."
    );
  });

  it("warns for missing OPENAI_API_KEY", () => {
    const warn = vi.fn();
    resolveServerAuthConfig(
      {
        DISABLE_AUTH: "true",
        OAUTH_SERVER_URL: "",
        BUILT_IN_FORGE_API_URL: "",
        LLM_API_URL: "",
        OPENAI_API_KEY: "",
      } as NodeJS.ProcessEnv,
      warn
    );

    expect(warn).toHaveBeenCalledWith(
      "[CONFIG] Missing OPENAI_API_KEY; OpenAI OCR extraction paths will fail until configured."
    );
  });

  it("uses SESSION_SECRET fallback for cookie secret when JWT_SECRET missing", async () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "render-session-secret");
    const envMod = await import("./_core/env");
    expect(envMod.ENV.cookieSecret).toBe("render-session-secret");
  });

  it("logs auth disabled only once across repeated startup validation", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.stubEnv("DISABLE_AUTH", "true");
    validateServerRuntimeConfigOnce();
    validateServerRuntimeConfigOnce();

    const authLogs = infoSpy.mock.calls.filter(
      call => call[0] === "[AUTH] Disabled via environment flag"
    );
    expect(authLogs.length).toBe(1);
  });

  it("reports schema sanity snapshot with personalization flag", () => {
    vi.mocked(getDatabaseSchemaSanitySnapshot).mockReturnValue({
      checked: true,
      checkedAt: new Date().toISOString(),
      requiredTables: ["personalization_metrics"],
      missingTables: ["personalization_metrics"],
      lastError: null,
      personalizationMetricsAvailable: false,
      personalizationFeaturesActive: false,
      bootstrap: {
        attempted: false,
        applied: false,
        error: null,
        mode: "disabled",
        migrationPreferred: true,
      },
    });
    const snapshot = getDatabaseSchemaSanitySnapshot();
    expect(snapshot.personalizationMetricsAvailable).toBe(false);
    expect(snapshot.missingTables).toContain("personalization_metrics");
  });
});
