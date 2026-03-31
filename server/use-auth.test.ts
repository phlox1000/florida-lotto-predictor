import { beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveDiagnosticMockRole", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to admin in diagnostic mode when role unset", async () => {
    const mod = await import("../client/src/_core/hooks/useAuth");
    expect(mod.resolveDiagnosticMockRole({})).toBe("admin");
  });

  it("honors explicit user role override", async () => {
    const mod = await import("../client/src/_core/hooks/useAuth");
    expect(mod.resolveDiagnosticMockRole({ VITE_MOCK_USER_ROLE: "user" })).toBe(
      "user"
    );
  });

  it("keeps admin when explicitly requested", async () => {
    const mod = await import("../client/src/_core/hooks/useAuth");
    expect(mod.resolveDiagnosticMockRole({ VITE_MOCK_USER_ROLE: "admin" })).toBe(
      "admin"
    );
  });
});
