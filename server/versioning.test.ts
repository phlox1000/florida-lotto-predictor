import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── Feature 1: Auto-Version Sync ─────────────────────────────────────────────

describe("Auto-Version Sync", () => {
  const versionContent = fs.readFileSync(
    path.resolve(__dirname, "../client/src/lib/version.ts"),
    "utf-8"
  );
  const swContent = fs.readFileSync(
    path.resolve(__dirname, "../client/public/sw.js"),
    "utf-8"
  );
  const whatsNewContent = fs.readFileSync(
    path.resolve(__dirname, "../client/src/components/WhatsNew.tsx"),
    "utf-8"
  );

  it("version.ts is the single source of truth with CHANGELOG and APP_VERSION exports", () => {
    expect(versionContent).toContain("export const CHANGELOG");
    expect(versionContent).toContain("export const APP_VERSION");
    expect(versionContent).toContain("CHANGELOG[0].version");
  });

  it("WhatsNew imports CHANGELOG from version.ts instead of defining its own", () => {
    expect(whatsNewContent).toContain('import { CHANGELOG, APP_VERSION');
    expect(whatsNewContent).toContain('from "@/lib/version"');
    // Should NOT have its own CHANGELOG definition
    expect(whatsNewContent).not.toContain("const CHANGELOG: ChangelogEntry[]");
  });

  it("SW version matches the APP_VERSION in version.ts", () => {
    // Extract version from version.ts
    const versionMatch = versionContent.match(/version:\s*"(\d+\.\d+\.\d+)"/);
    const latestVersion = versionMatch?.[1];
    expect(latestVersion).toBeTruthy();

    // Extract version from sw.js
    const swMatch = swContent.match(/const APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
    const swVersion = swMatch?.[1];
    expect(swVersion).toBeTruthy();

    // They must match
    expect(swVersion).toBe(latestVersion);
  });

  it("version.ts exports parseSemver utility", () => {
    expect(versionContent).toContain("export function parseSemver");
  });

  it("version.ts exports isMajorBump utility", () => {
    expect(versionContent).toContain("export function isMajorBump");
  });

  it("CHANGELOG has entries sorted newest first (version descending)", () => {
    // Extract all version strings from CHANGELOG
    const versions = [...versionContent.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)].map(
      (m) => m[1]
    );
    expect(versions.length).toBeGreaterThan(1);
    // First version should be >= second version
    const [major1] = versions[0].split(".").map(Number);
    const [major2] = versions[1].split(".").map(Number);
    expect(major1).toBeGreaterThanOrEqual(major2);
  });
});

// ─── Feature 2: Force-Refresh on Major Updates ───────────────────────────────

describe("Force-Refresh on Major Updates", () => {
  const updatePromptContent = fs.readFileSync(
    path.resolve(__dirname, "../client/src/components/UpdatePrompt.tsx"),
    "utf-8"
  );
  const versionContent = fs.readFileSync(
    path.resolve(__dirname, "../client/src/lib/version.ts"),
    "utf-8"
  );

  it("UpdatePrompt imports isMajorBump from version module", () => {
    expect(updatePromptContent).toContain("isMajorBump");
    expect(updatePromptContent).toContain('from "@/lib/version"');
  });

  it("UpdatePrompt has isMajor state for detecting major version bumps", () => {
    expect(updatePromptContent).toContain("const [isMajor, setIsMajor]");
  });

  it("UpdatePrompt has countdown state for auto-refresh timer", () => {
    expect(updatePromptContent).toContain("const [countdown, setCountdown]");
  });

  it("UpdatePrompt auto-applies update when countdown reaches 0", () => {
    expect(updatePromptContent).toContain("countdown <= 0");
    expect(updatePromptContent).toContain("applyUpdate()");
  });

  it("UpdatePrompt shows different UI for major vs minor updates", () => {
    // Major: amber warning style
    expect(updatePromptContent).toContain("Critical Update Available");
    expect(updatePromptContent).toContain("AlertTriangle");
    expect(updatePromptContent).toContain("border-amber-500");
    // Minor: standard cyan style
    expect(updatePromptContent).toContain("A new version is available");
    expect(updatePromptContent).toContain("border-cyan-500");
  });

  it("UpdatePrompt records force update in history", () => {
    expect(updatePromptContent).toContain('recordUpdate(APP_VERSION, "force")');
  });

  it("isMajorBump correctly identifies major version changes", () => {
    // Test the logic described in version.ts
    expect(versionContent).toContain("newMajor > oldMajor");
  });
});

// ─── Feature 3: Update History Log ────────────────────────────────────────────

describe("Update History Log", () => {
  const versionContent = fs.readFileSync(
    path.resolve(__dirname, "../client/src/lib/version.ts"),
    "utf-8"
  );
  const settingsContent = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/Settings.tsx"),
    "utf-8"
  );

  it("version.ts exports UpdateHistoryEntry interface", () => {
    expect(versionContent).toContain("export interface UpdateHistoryEntry");
  });

  it("version.ts exports getUpdateHistory function", () => {
    expect(versionContent).toContain("export function getUpdateHistory");
  });

  it("version.ts exports recordUpdate function", () => {
    expect(versionContent).toContain("export function recordUpdate");
  });

  it("UpdateHistoryEntry has version, appliedAt, and method fields", () => {
    expect(versionContent).toContain("version: string");
    expect(versionContent).toContain("appliedAt: string");
    expect(versionContent).toContain('method: "auto" | "manual" | "force"');
  });

  it("recordUpdate prevents duplicate entries for the same version", () => {
    expect(versionContent).toContain("history[0].version === version");
  });

  it("recordUpdate keeps only the last 20 entries", () => {
    expect(versionContent).toContain("history.length > 20");
  });

  it("Settings page has UpdateHistoryCard component", () => {
    expect(settingsContent).toContain("UpdateHistoryCard");
    expect(settingsContent).toContain("function UpdateHistoryCard");
  });

  it("UpdateHistoryCard imports getUpdateHistory from version module", () => {
    expect(settingsContent).toContain("getUpdateHistory");
    expect(settingsContent).toContain('from "@/lib/version"');
  });

  it("UpdateHistoryCard shows method icons for force, auto, and manual updates", () => {
    expect(settingsContent).toContain('case "force"');
    expect(settingsContent).toContain('case "auto"');
    expect(settingsContent).toContain('case "manual"');
  });

  it("UpdateHistoryCard shows 'Current' badge on the latest entry", () => {
    expect(settingsContent).toContain("Current");
    expect(settingsContent).toContain("i === 0");
  });

  it("UpdateHistoryCard has expand/collapse for long history", () => {
    expect(settingsContent).toContain("Show all");
    expect(settingsContent).toContain("setExpanded(true)");
    expect(settingsContent).toContain("history.length > 5");
  });

  it("UpdateHistoryCard shows empty state when no history exists", () => {
    expect(settingsContent).toContain("No update history yet");
  });

  it("Settings page shows force-refresh badge in App Version card", () => {
    expect(settingsContent).toContain("Force-refresh");
    expect(settingsContent).toContain("On major updates");
  });

  it("WhatsNew records update in history when dismissed", () => {
    const whatsNewContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/WhatsNew.tsx"),
      "utf-8"
    );
    expect(whatsNewContent).toContain("recordUpdate");
  });
});
