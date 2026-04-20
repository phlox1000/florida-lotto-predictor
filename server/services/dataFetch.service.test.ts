/**
 * Unit tests for getAutoFetchStatus.
 *
 * These exercise the DB-backed status reporting added in the
 * `followup/autofetch-status-from-db` PR. The function is tested in
 * isolation (not via the full tRPC stack) because the interesting behavior
 * is the translation from the `auto_fetch_runs` row shape to the public
 * status object — not the routing/auth layer, which is already covered by
 * the existing shape test in new-features.test.ts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the db module so we can control what getLatestAutoFetchRun returns
// without needing a live database. Hoisted above the import of the service.
vi.mock("../db", () => ({
  getLatestAutoFetchRun: vi.fn(),
  insertDrawResult: vi.fn(),
  evaluatePredictionsAgainstDraw: vi.fn(),
}));
// The service pulls runAutoFetch from ../cron for the triggerAutoFetch
// helper; we don't exercise that path here but the import chain requires
// the mock to avoid pulling in the full DB/scraper stack.
vi.mock("../cron", () => ({
  runAutoFetch: vi.fn(),
}));

import { getAutoFetchStatus } from "./dataFetch.service";
import { getLatestAutoFetchRun } from "../db";

const mockedGetLatestAutoFetchRun = getLatestAutoFetchRun as unknown as ReturnType<typeof vi.fn>;

describe("getAutoFetchStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin "now" so freshness-window assertions are deterministic.
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    mockedGetLatestAutoFetchRun.mockReset();
  });

  it("reports inactive with null lastRun when no run has been recorded", async () => {
    mockedGetLatestAutoFetchRun.mockResolvedValue(null);

    const status = await getAutoFetchStatus();

    expect(status.isScheduleActive).toBe(false);
    expect(status.isRunning).toBe(false);
    expect(status.lastRun).toBeNull();
  });

  it("reports active when the latest run started within the 7h freshness window", async () => {
    const now = Date.now();
    mockedGetLatestAutoFetchRun.mockResolvedValue({
      id: 42,
      startedAt: now - 3 * 60 * 60 * 1000, // 3h ago, well within the 7h window
      finishedAt: now - 3 * 60 * 60 * 1000 + 20_000,
      status: "completed",
      trigger: "cron",
      gamesProcessed: 10,
      totalNewDraws: 1,
      totalEvaluations: 5,
      highAccuracyAlerts: 0,
      gameResults: { fantasy_5: { newDraws: 1, evaluations: 5, errors: 0 } },
      errors: [],
      createdAt: new Date(),
    } as any);

    const status = await getAutoFetchStatus();

    expect(status.isScheduleActive).toBe(true);
    expect(status.isRunning).toBe(false);
    expect(status.lastRun).not.toBeNull();
    expect(status.lastRun?.totalNewDraws).toBe(1);
    expect(status.lastRun?.totalEvaluations).toBe(5);
    expect(status.lastRun?.errors).toEqual([]);
    expect(status.lastRun?.gameResults).toHaveProperty("fantasy_5");
  });

  it("reports inactive when the latest run is older than the freshness window", async () => {
    const now = Date.now();
    // 9h ago — beyond the 7h window. The row is still the "last run" and
    // its data should still appear, but isScheduleActive should flip off so
    // the admin UI can surface that the schedule is lagging.
    mockedGetLatestAutoFetchRun.mockResolvedValue({
      id: 1,
      startedAt: now - 9 * 60 * 60 * 1000,
      finishedAt: now - 9 * 60 * 60 * 1000 + 20_000,
      status: "completed",
      trigger: "cron",
      gamesProcessed: 10,
      totalNewDraws: 0,
      totalEvaluations: 0,
      highAccuracyAlerts: 0,
      gameResults: {},
      errors: [],
      createdAt: new Date(),
    } as any);

    const status = await getAutoFetchStatus();

    expect(status.isScheduleActive).toBe(false);
    expect(status.isRunning).toBe(false);
    expect(status.lastRun).not.toBeNull();
  });

  it("reports isRunning=true for an in-flight row (no finishedAt yet)", async () => {
    const now = Date.now();
    mockedGetLatestAutoFetchRun.mockResolvedValue({
      id: 7,
      startedAt: now - 5_000,
      finishedAt: null,
      status: "running",
      trigger: "cron",
      gamesProcessed: 0,
      totalNewDraws: 0,
      totalEvaluations: 0,
      highAccuracyAlerts: 0,
      gameResults: null,
      errors: null,
      createdAt: new Date(),
    } as any);

    const status = await getAutoFetchStatus();

    expect(status.isRunning).toBe(true);
    expect(status.isScheduleActive).toBe(true);
    // NULL json columns must be normalized to safe empty values so that
    // `status.lastRun.errors.length` on the client doesn't throw.
    expect(status.lastRun?.errors).toEqual([]);
    expect(status.lastRun?.gameResults).toEqual({});
  });

  it("still reports lastRun for a failed run with recorded errors", async () => {
    const now = Date.now();
    mockedGetLatestAutoFetchRun.mockResolvedValue({
      id: 99,
      startedAt: now - 60_000,
      finishedAt: now - 55_000,
      status: "failed",
      trigger: "manual",
      gamesProcessed: 3,
      totalNewDraws: 0,
      totalEvaluations: 0,
      highAccuracyAlerts: 0,
      gameResults: {},
      errors: ["upstream timeout", "db connection lost"],
      createdAt: new Date(),
    } as any);

    const status = await getAutoFetchStatus();

    expect(status.isRunning).toBe(false);
    expect(status.lastRun?.errors).toHaveLength(2);
    expect(status.lastRun?.errors[0]).toBe("upstream timeout");
  });
});
