import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Head-to-Head Matchups ──────────────────────────────────────────────────

describe("Head-to-Head Matchups", () => {
  const routersPath = resolve(__dirname, "routers.ts");
  const routersSrc = readFileSync(routersPath, "utf-8");

  it("has headToHead endpoint in leaderboard router", () => {
    expect(routersSrc).toContain("headToHead:");
    expect(routersSrc).toContain("modelA: z.string()");
    expect(routersSrc).toContain("modelB: z.string()");
  });

  it("returns per-game breakdown with winner determination", () => {
    expect(routersSrc).toContain("winner:");
    expect(routersSrc).toContain("gameMap");
    expect(routersSrc).toContain("avgMainHits");
  });

  it("returns overall summary with wins/ties/overall winner", () => {
    expect(routersSrc).toContain("aWins");
    expect(routersSrc).toContain("bWins");
    expect(routersSrc).toContain("ties");
    expect(routersSrc).toContain("overallWinner");
  });

  it("queries both models using inArray filter", () => {
    expect(routersSrc).toContain("inArray(modelPerformance.modelName, [input.modelA, input.modelB])");
  });

  // H2H Page
  const h2hPagePath = resolve(__dirname, "../client/src/pages/HeadToHead.tsx");
  it("HeadToHead page exists", () => {
    expect(existsSync(h2hPagePath)).toBe(true);
  });

  it("HeadToHead page has model selectors", () => {
    const src = readFileSync(h2hPagePath, "utf-8");
    expect(src).toContain("Model A");
    expect(src).toContain("Model B");
    expect(src).toContain("setModelA");
    expect(src).toContain("setModelB");
  });

  it("HeadToHead page calls leaderboard.headToHead query", () => {
    const src = readFileSync(h2hPagePath, "utf-8");
    expect(src).toContain("trpc.leaderboard.headToHead.useQuery");
  });

  it("HeadToHead page shows per-game stat comparison", () => {
    const src = readFileSync(h2hPagePath, "utf-8");
    expect(src).toContain("StatCompare");
    expect(src).toContain("Avg Hits");
    expect(src).toContain("Best Match");
    expect(src).toContain("Consistency");
  });

  it("HeadToHead page shows overall winner banner", () => {
    const src = readFileSync(h2hPagePath, "utf-8");
    expect(src).toContain("WINNER");
    expect(src).toContain("TIE");
    expect(src).toContain("overallWinner");
  });

  // Route registration
  const appPath = resolve(__dirname, "../client/src/App.tsx");
  it("HeadToHead route is registered in App.tsx", () => {
    const src = readFileSync(appPath, "utf-8");
    expect(src).toContain("head-to-head");
    expect(src).toContain("HeadToHead");
  });

  // Navbar link
  const navPath = resolve(__dirname, "../client/src/components/Navbar.tsx");
  it("H2H nav link exists in Navbar", () => {
    const src = readFileSync(navPath, "utf-8");
    expect(src).toContain("/head-to-head");
    expect(src).toContain("H2H");
    expect(src).toContain("Swords");
  });
});

// ─── Consensus Strength Score ───────────────────────────────────────────────

describe("Consensus Strength Score", () => {
  const panelPath = resolve(__dirname, "../client/src/components/ConsensusPanel.tsx");

  it("ConsensusPanel component exists", () => {
    expect(existsSync(panelPath)).toBe(true);
  });

  const src = readFileSync(panelPath, "utf-8");

  it("computes consensus from predictions array", () => {
    expect(src).toContain("mainCounts");
    expect(src).toContain("specialCounts");
    expect(src).toContain("percentage");
  });

  it("categorizes numbers into strong/moderate/weak tiers", () => {
    expect(src).toContain("strong");
    expect(src).toContain("moderate");
    expect(src).toContain("weak");
    expect(src).toContain("getStrength");
  });

  it("shows top consensus pick with model count", () => {
    expect(src).toContain("Top Consensus");
    expect(src).toContain("topPick");
  });

  it("displays agreement bar chart for all numbers", () => {
    expect(src).toContain("All Numbers by Agreement");
    expect(src).toContain("getBarColor");
  });

  it("shows tooltips with which models picked each number", () => {
    expect(src).toContain("Picked by:");
    expect(src).toContain("models.join");
  });

  it("handles special numbers consensus", () => {
    expect(src).toContain("specialConsensus");
    expect(src).toContain("Special Number Consensus");
  });

  // Integration in Predictions page
  const predPath = resolve(__dirname, "../client/src/pages/Predictions.tsx");
  it("ConsensusPanel is imported in Predictions page", () => {
    const predSrc = readFileSync(predPath, "utf-8");
    expect(predSrc).toContain("import ConsensusPanel");
    expect(predSrc).toContain("<ConsensusPanel");
  });

  it("ConsensusPanel receives predictions prop", () => {
    const predSrc = readFileSync(predPath, "utf-8");
    expect(predSrc).toContain("predictions={predictions}");
  });
});

// ─── Version Sync ───────────────────────────────────────────────────────────

describe("Version 4.4.0", () => {
  it("changelog has v4.4.0 entry", () => {
    const versionPath = resolve(__dirname, "../client/src/lib/version.ts");
    const src = readFileSync(versionPath, "utf-8");
    expect(src).toContain('"4.4.0"');
    expect(src).toContain("Head-to-Head");
    expect(src).toContain("Consensus");
  });

  it("service worker version matches latest changelog entry", () => {
    // The SW version is now derived from the latest CHANGELOG entry (currently 4.5.1).
    // It no longer hardcodes 4.4.0.
    const swPath = resolve(__dirname, "../client/public/sw.js");
    const swSrc = readFileSync(swPath, "utf-8");
    const versionPath = resolve(__dirname, "../client/src/lib/version.ts");
    const versionSrc = readFileSync(versionPath, "utf-8");
    // Extract the first version string from CHANGELOG
    const match = versionSrc.match(/version:\s*"([^"]+)"/); 
    expect(match).toBeTruthy();
    const currentVersion = match![1];
    expect(swSrc).toContain(`'${currentVersion}'`);
  });
});
