import { describe, it, expect } from "vitest";
import {
  findCandidateDraws,
  extractFactorSnapshot,
  buildBackfillEventRow,
  SEVEN_DAYS_MS,
  type DrawLite,
  type PredictionLite,
} from "./backfillHelpers";

const baseDate = new Date("2026-04-23T12:00:00.000Z");

function makeDraw(id: number, drawDate: Date, mainNumbers = [1, 2, 3, 4, 5]): DrawLite {
  return { id, drawDate: drawDate.getTime(), mainNumbers };
}

function makePrediction(overrides: Partial<PredictionLite> = {}): PredictionLite {
  return {
    id: 100,
    userId: 1,
    modelName: "frequency_baseline",
    gameType: "fantasy_5",
    mainNumbers: [1, 2, 3, 4, 5],
    metadata: null,
    createdAt: baseDate,
    ...overrides,
  };
}

describe("findCandidateDraws", () => {
  it("returns empty when no draws are in the window", () => {
    const result = findCandidateDraws({ createdAt: baseDate }, []);
    expect(result).toEqual([]);
  });

  it("excludes draws with drawDate equal to the prediction time (strict >)", () => {
    const draws = [makeDraw(1, baseDate)];
    const result = findCandidateDraws({ createdAt: baseDate }, draws);
    expect(result).toEqual([]);
  });

  it("includes draws with drawDate strictly after the prediction time", () => {
    const oneSecondLater = new Date(baseDate.getTime() + 1000);
    const draws = [makeDraw(1, oneSecondLater)];
    const result = findCandidateDraws({ createdAt: baseDate }, draws);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("includes draws exactly at the cutoff (inclusive end of window)", () => {
    const atCutoff = new Date(baseDate.getTime() + SEVEN_DAYS_MS);
    const draws = [makeDraw(1, atCutoff)];
    const result = findCandidateDraws({ createdAt: baseDate }, draws);
    expect(result).toHaveLength(1);
  });

  it("excludes draws past the cutoff", () => {
    const pastCutoff = new Date(baseDate.getTime() + SEVEN_DAYS_MS + 1);
    const draws = [makeDraw(1, pastCutoff)];
    const result = findCandidateDraws({ createdAt: baseDate }, draws);
    expect(result).toEqual([]);
  });

  it("returns multiple draws in chronological order of input", () => {
    const draws = [
      makeDraw(1, new Date(baseDate.getTime() + 24 * 60 * 60 * 1000)),
      makeDraw(2, new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000)),
      makeDraw(3, new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000)),
    ];
    const result = findCandidateDraws({ createdAt: baseDate }, draws);
    expect(result).toHaveLength(3);
    expect(result.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it("excludes draws before the prediction", () => {
    const before = new Date(baseDate.getTime() - 1000);
    const draws = [makeDraw(1, before)];
    const result = findCandidateDraws({ createdAt: baseDate }, draws);
    expect(result).toEqual([]);
  });

  it("respects custom windowMs argument", () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const draws = [
      makeDraw(1, new Date(baseDate.getTime() + 12 * 60 * 60 * 1000)),
      makeDraw(2, new Date(baseDate.getTime() + 2 * oneDayMs)),
    ];
    const result = findCandidateDraws({ createdAt: baseDate }, draws, oneDayMs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

describe("extractFactorSnapshot", () => {
  it("returns {} for null metadata", () => {
    expect(extractFactorSnapshot(null)).toEqual({});
  });

  it("returns {} when explainable is missing", () => {
    expect(extractFactorSnapshot({ other: "data" })).toEqual({});
  });

  it("returns {} when factorSnapshot is missing under explainable", () => {
    expect(extractFactorSnapshot({ explainable: { aiScore: 0.5 } })).toEqual({});
  });

  it("returns {} when factorSnapshot is explicitly an empty object", () => {
    expect(extractFactorSnapshot({ explainable: { factorSnapshot: {} } })).toEqual({});
  });

  it("returns the factorSnapshot when populated", () => {
    const snapshot = { historicalFrequency: 0.42, hotColdBalance: 0.7 };
    const result = extractFactorSnapshot({ explainable: { factorSnapshot: snapshot } });
    expect(result).toEqual(snapshot);
  });
});

describe("buildBackfillEventRow", () => {
  const draw = makeDraw(500, new Date("2026-04-25T01:00:00.000Z"), [1, 2, 99, 98, 97]);
  const prediction = makePrediction({
    id: 73,
    userId: 7,
    modelName: "frequency_baseline",
    gameType: "fantasy_5",
    mainNumbers: [1, 2, 3, 4, 5],
    metadata: { explainable: { factorSnapshot: { historicalFrequency: 0.45 } } },
    createdAt: baseDate,
  });

  it("produces a deterministic id", () => {
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(row.id).toBe("backfill:accuracy:fantasy_5:73:500");
  });

  it("re-runs with same inputs produce identical id and payload (idempotency check)", () => {
    const a = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    const b = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(a).toEqual(b);
  });

  it("uses the draw date for occurred_at (not the prediction or insertion time)", () => {
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(row.occurred_at).toEqual(new Date("2026-04-25T01:00:00.000Z"));
  });

  it("constructs correlation_id in the live path's format", () => {
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(row.correlation_id).toBe(
      `prediction:fantasy_5:7:${baseDate.getTime()}`,
    );
  });

  it("computes match_ratio = mainHits / total_picks", () => {
    // predicted [1,2,3,4,5] vs actual [1,2,99,98,97] = 2 hits / 5 = 0.4
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(row.payload.matched_numbers).toBe(2);
    expect(row.payload.total_picks).toBe(5);
    expect(row.payload.match_ratio).toBeCloseTo(0.4, 5);
  });

  it("places exactly one model in model_scores (matching live emit shape)", () => {
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(Object.keys(row.payload.model_scores)).toEqual(["frequency_baseline"]);
    expect(row.payload.model_scores["frequency_baseline"]).toBeCloseTo(0.4, 5);
  });

  it("includes backfill metadata fields in payload", () => {
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(row.payload.source).toBe("historical_backfill_phase1");
    expect(row.payload.backfill_run_id).toBe("run-A");
    expect(row.payload.prediction_id).toBe(73);
    expect(row.payload.draw_result_id).toBe(500);
  });

  it("uses default app_id, schema_version, platform_version when not provided", () => {
    const row = buildBackfillEventRow({ prediction, draw, backfillRunId: "run-A" });
    expect(row.app_id).toBe("florida-lotto");
    expect(row.schema_version).toBe("1.0");
    expect(row.platform_version).toBe("1.0.0");
  });
});
