import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParsedDraw } from "./lib/fl-lottery-scraper";

// ── Stable mock handles (hoisted so factories can reference them) ─────────────

const mocks = vi.hoisted(() => ({
  fetchHistoricalDraws: vi.fn<[string, number], Promise<ParsedDraw[]>>(),
  insertDrawResult: vi.fn(),
}));

vi.mock("./lib/fl-lottery-scraper", () => ({
  fetchHistoricalDraws: mocks.fetchHistoricalDraws,
  // Other named exports from the scraper are not used by fetchHistoryChunk
  extractFontTexts: vi.fn(),
  parseDate: vi.fn(),
  isDate: vi.fn(),
  isNumber: vi.fn(),
  FILE_CODES: {},
}));

// Only mock what fetchHistoryChunk actually calls — don't importOriginal since
// real DB initialization would run and potentially hang the test suite.
vi.mock("./db", () => ({
  insertDrawResult: mocks.insertDrawResult,
  evaluatePredictionsAgainstDraw: vi.fn(),
  getLatestAutoFetchRun: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDraw(i: number): ParsedDraw {
  const d = String(i).padStart(2, "0");
  return {
    drawDate: `2024-01-${d}`,
    mainNumbers: [1, 2, 3, 4, 5],
    specialNumbers: [],
    drawTime: "evening",
  };
}

function makeDraws(count: number): ParsedDraw[] {
  return Array.from({ length: count }, (_, i) => makeDraw(i + 1));
}

// ── Shared import (cached after first dynamic import; mocks are already wired) ─

let fetchHistoryChunk: typeof import("./services/dataFetch.service").fetchHistoryChunk;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.insertDrawResult.mockResolvedValue({ insertId: 1 });

  if (!fetchHistoryChunk) {
    const mod = await import("./services/dataFetch.service");
    fetchHistoryChunk = mod.fetchHistoryChunk;
  }
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fetchHistoryChunk", () => {
  it("returns hasMore:true and correct nextOffset when more draws remain", async () => {
    // 120 draws total; first chunk of 50 → hasMore should be true
    mocks.fetchHistoricalDraws.mockResolvedValue(makeDraws(120));

    const result = await fetchHistoryChunk("fantasy_5", 0, 50);

    expect(result.fetched).toBe(50);
    expect(result.inserted).toBe(50);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(50);
    expect(result.totalAvailable).toBe(120);
  });

  it("returns hasMore:false on the last batch", async () => {
    // 120 draws; offset=100, batchSize=50 → only 20 remain → hasMore false
    mocks.fetchHistoricalDraws.mockResolvedValue(makeDraws(120));

    const result = await fetchHistoryChunk("fantasy_5", 100, 50);

    expect(result.fetched).toBe(20);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBe(150);
    expect(result.totalAvailable).toBe(120);
  });

  it("returns hasMore:false when batchSize exactly covers remaining draws", async () => {
    mocks.fetchHistoricalDraws.mockResolvedValue(makeDraws(50));

    const result = await fetchHistoryChunk("fantasy_5", 0, 50);

    expect(result.fetched).toBe(50);
    expect(result.hasMore).toBe(false);
  });

  it("skips duplicate inserts silently and still returns correct counts", async () => {
    mocks.fetchHistoricalDraws.mockResolvedValue(makeDraws(10));

    // First 5 succeed; remaining 5 throw a duplicate-constraint error
    mocks.insertDrawResult
      .mockResolvedValueOnce({ insertId: 1 })
      .mockResolvedValueOnce({ insertId: 2 })
      .mockResolvedValueOnce({ insertId: 3 })
      .mockResolvedValueOnce({ insertId: 4 })
      .mockResolvedValueOnce({ insertId: 5 })
      .mockRejectedValue(new Error("UNIQUE constraint failed"));

    const result = await fetchHistoryChunk("fantasy_5", 0, 10);

    expect(result.fetched).toBe(10);
    expect(result.inserted).toBe(5); // 5 new, 5 skipped duplicates
    expect(result.hasMore).toBe(false);
  });

  it("timeout guard resolves with hasMore:true (same offset) instead of crashing", async () => {
    vi.useFakeTimers();

    // Import with real timers already applied to the module — the key is that
    // setTimeout inside fetchHistoryChunk will be captured by fake timers at
    // call time, not at import time, so this works with the cached module.
    mocks.fetchHistoricalDraws.mockReturnValue(new Promise<ParsedDraw[]>(() => {})); // never resolves

    // Start the chunk fetch — this registers the internal 25 000ms timeout in
    // the fake timer queue.
    const resultPromise = fetchHistoryChunk("fantasy_5", 0, 50);

    // Fire the 25s guard
    vi.advanceTimersByTime(26_000);

    const result = await resultPromise;

    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
    // hasMore:true so the client knows to retry from the same offset
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(0);
  });
});
