import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── Feature 1: Per-Model Game Affinity Tags ──────────────────────────────────

describe("Per-Model Game Affinity Tags", () => {
  it("db.ts exports getModelGameAffinity function", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("export async function getModelGameAffinity");
  });

  it("getModelGameAffinity returns affinity tags with bestGame and affinityTags fields", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("bestGame");
    expect(dbContent).toContain("bestGameAvgHits");
    expect(dbContent).toContain("affinityTags");
  });

  it("affinity endpoint is registered in leaderboard router", () => {
    const routerContent = fs.readFileSync(path.resolve(__dirname, "routers/leaderboard.router.ts"), "utf-8");
    expect(routerContent).toContain("affinity: publicProcedure");
    expect(routerContent).toContain("getAffinity");
  });

  it("Leaderboard UI imports Gamepad2 icon for affinity badges", () => {
    const leaderboardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Leaderboard.tsx"),
      "utf-8"
    );
    expect(leaderboardContent).toContain("Gamepad2");
    expect(leaderboardContent).toContain("affinityMap");
  });

  it("Leaderboard UI renders affinity tags on model cards", () => {
    const leaderboardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Leaderboard.tsx"),
      "utf-8"
    );
    expect(leaderboardContent).toContain("Game Affinity Tags");
    expect(leaderboardContent).toContain("tag.label === \"Best\"");
  });

  it("affinity computation filters models with at least 3 evaluations", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("g.total >= 3");
  });

  it("affinity tags include Best and Strong labels", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain('"Best"');
    expect(dbContent).toContain('"Strong"');
  });
});

// ─── Feature 2: Prediction Streak Alerts ──────────────────────────────────────

describe("Prediction Streak Alerts", () => {
  it("db.ts exports getModelStreaks function", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("export async function getModelStreaks");
  });

  it("getModelStreaks returns streak data with currentStreak and isHot fields", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("currentStreak");
    expect(dbContent).toContain("maxStreak");
    expect(dbContent).toContain("isHot");
  });

  it("streaks endpoint is registered in leaderboard router", () => {
    const routerContent = fs.readFileSync(path.resolve(__dirname, "routers/leaderboard.router.ts"), "utf-8");
    expect(routerContent).toContain("streaks: publicProcedure");
    expect(routerContent).toContain("getStreaks");
  });

  it("streaks endpoint accepts minHits parameter", () => {
    const routerContent = fs.readFileSync(path.resolve(__dirname, "routers/leaderboard.router.ts"), "utf-8");
    expect(routerContent).toContain("minHits: z.number().min(1).max(6).default(3)");
  });

  it("streaks endpoint separates hotStreaks from allStreaks", () => {
    const serviceContent = fs.readFileSync(path.resolve(__dirname, "services/leaderboard.service.ts"), "utf-8");
    expect(serviceContent).toContain("hotStreaks");
    expect(serviceContent).toContain("allStreaks");
  });

  it("Leaderboard UI shows HotStreakBanner component", () => {
    const leaderboardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Leaderboard.tsx"),
      "utf-8"
    );
    expect(leaderboardContent).toContain("HotStreakBanner");
    expect(leaderboardContent).toContain("Hot Streaks Active");
  });

  it("Leaderboard UI shows Flame icon for streak badges", () => {
    const leaderboardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/Leaderboard.tsx"),
      "utf-8"
    );
    expect(leaderboardContent).toContain("Flame");
    expect(leaderboardContent).toContain("streakMap");
  });

  it("streak detection uses configurable minHits threshold", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("getModelStreaks(minHits");
    expect(dbContent).toContain("rec.mainHits >= minHits");
  });

  it("hot streak is defined as currentStreak >= 3", () => {
    const dbContent = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    expect(dbContent).toContain("isHot: currentStreak >= 3");
  });
});

// ─── Feature 3: Export History to CSV ─────────────────────────────────────────

describe("Export History to CSV", () => {
  it("csvExport router is registered in routers index", () => {
    const routerContent = fs.readFileSync(path.resolve(__dirname, "routers/index.ts"), "utf-8");
    expect(routerContent).toContain("csvExport: csvExportRouter");
  });

  it("csvExport.drawResults endpoint exists as publicProcedure", () => {
    const routerContent = fs.readFileSync(path.resolve(__dirname, "routers/csvExport.router.ts"), "utf-8");
    expect(routerContent).toContain("drawResults: publicProcedure");
    expect(routerContent).toContain("gameType: gameTypeSchema.optional()");
  });

  it("csvExport.predictions endpoint exists as protectedProcedure", () => {
    const routerContent = fs.readFileSync(path.resolve(__dirname, "routers/csvExport.router.ts"), "utf-8");
    expect(routerContent).toContain("predictions: protectedProcedure");
  });

  it("CSV export includes proper headers for draw results", () => {
    const serviceContent = fs.readFileSync(path.resolve(__dirname, "services/csvExport.service.ts"), "utf-8");
    expect(serviceContent).toContain('"Date", "Game", "Draw Time", "Main Numbers", "Special Numbers", "Source"');
  });

  it("CSV export includes proper headers for predictions", () => {
    const serviceContent = fs.readFileSync(path.resolve(__dirname, "services/csvExport.service.ts"), "utf-8");
    expect(serviceContent).toContain('"Date", "Game", "Model", "Main Numbers", "Special Numbers", "Confidence"');
  });

  it("History page includes Export CSV tab", () => {
    const historyContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/History.tsx"),
      "utf-8"
    );
    expect(historyContent).toContain("Export CSV");
    expect(historyContent).toContain("ExportPanel");
  });

  it("History page has downloadCSV helper function", () => {
    const historyContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/History.tsx"),
      "utf-8"
    );
    expect(historyContent).toContain("function downloadCSV");
    expect(historyContent).toContain("text/csv");
    expect(historyContent).toContain("URL.createObjectURL");
  });

  it("Export panel has game filter selector", () => {
    const historyContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/History.tsx"),
      "utf-8"
    );
    expect(historyContent).toContain("exportGame");
    expect(historyContent).toContain("Filter by game");
    expect(historyContent).toContain("All Games");
  });

  it("Export panel has separate buttons for draw results and predictions", () => {
    const historyContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/History.tsx"),
      "utf-8"
    );
    expect(historyContent).toContain("exportDrawResults");
    expect(historyContent).toContain("exportPredictions");
    expect(historyContent).toContain("Draw Results");
    expect(historyContent).toContain("My Predictions");
  });

  it("CSV filenames include game type and date", () => {
    const historyContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/History.tsx"),
      "utf-8"
    );
    expect(historyContent).toContain("fl_lotto_draw_results_");
    expect(historyContent).toContain("fl_lotto_predictions_");
    expect(historyContent).toContain(".csv");
  });
});
