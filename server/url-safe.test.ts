import { describe, expect, it } from "vitest";
import {
  parseBooleanFlag,
  safeBuildUrl,
  safeJoinPath,
  safeOrigin,
  safeRelativePath,
} from "../shared/url-safe";
import { requireServerServiceUrl, safeServerUrl } from "./_core/url-safe";

describe("shared/server URL safety helpers", () => {
  it("parses boolean flags consistently", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
    expect(parseBooleanFlag("yes")).toBe(true);
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
  });

  it("safeBuildUrl handles malformed/missing input without throwing", () => {
    expect(safeBuildUrl(undefined)).toBeNull();
    expect(safeBuildUrl("://bad", { base: "://also-bad" })).toBeNull();
  });

  it("safeBuildUrl resolves relative path with valid base", () => {
    const url = safeBuildUrl("/app-auth", {
      base: "https://florida-lotto-predictor.onrender.com",
    });
    expect(url?.toString()).toBe("https://florida-lotto-predictor.onrender.com/app-auth");
  });

  it("safeJoinPath and safeRelativePath return fallbacks safely", () => {
    expect(
      safeJoinPath("/base", "/x", { fallback: "/fallback", originFallback: "://bad-origin" })
    ).toBe("/fallback");
    expect(
      safeRelativePath("https://evil.example/redirect", {
        fallback: "/",
        currentOrigin: "https://florida-lotto-predictor.onrender.com",
      })
    ).toBe("/");
  });

  it("safeOrigin falls back for malformed origin", () => {
    expect(safeOrigin("://bad", "http://localhost")).toBe("http://localhost");
  });

  it("server URL helper validates and throws explicit config error", () => {
    expect(safeServerUrl("https://api.example.com")?.toString()).toBe("https://api.example.com/");
    expect(() =>
      requireServerServiceUrl({
        servicePath: "://bad-service",
        baseUrl: "",
        envName: "BUILT_IN_FORGE_API_URL",
      })
    ).toThrow(/BUILT_IN_FORGE_API_URL is invalid/);
  });
});
