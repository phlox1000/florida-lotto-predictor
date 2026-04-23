/**
 * Tests for getModelWeights personalization loop.
 *
 * Mocks drizzle-orm/mysql2 so we can control what the DB returns for
 * the global model-performance query and the per-user app_events query,
 * without hitting Railway.
 *
 * Each test uses a unique gameType string so entries in the 5-minute
 * in-memory weight cache never collide between tests.
 */
import { vi, describe, it, expect, beforeAll } from "vitest";

// ─── Mock drizzle ──────────────────────────────────────────────────────────
const { mockSelect } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  return { mockSelect };
});

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn().mockReturnValue({ select: mockSelect }),
}));

// Ensure DATABASE_URL is set so getDb() initialises _db with our mock.
// The real value is already in .env; this guards against edge cases.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "mysql://fake:fake@localhost/fake";

import { getModelWeights } from "./db";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a Drizzle-like fluent query chain whose terminal call resolves to `result`. */
function makeChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockResolvedValue(result);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  return chain;
}

/** A model-performance row as Drizzle would return it. */
function statRow(modelName: string, avgMainHits: number, totalPredictions: number) {
  return { modelName, avgMainHits, totalPredictions, avgSpecialHits: 0, maxMainHits: avgMainHits };
}

/** A prediction_accuracy_calculated app_events row with given modelScores. */
function accuracyEvent(modelScores: Record<string, number>) {
  return {
    id: crypto.randomUUID(),
    event_type: "prediction_accuracy_calculated",
    app_id: "florida-lotto",
    user_id: 42,
    correlation_id: "prediction:fantasy_5:42:1714000000000",
    occurred_at: new Date(),
    recorded_at: new Date(),
    schema_version: "1.0",
    platform_version: "1.0.0",
    payload: { model_scores: modelScores },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("getModelWeights — global path (no userId)", () => {
  it("returns global weights derived from model performance stats", async () => {
    mockSelect.mockReturnValueOnce(
      makeChain([statRow("modelA", 4, 20), statRow("modelB", 2, 15)]),
    );

    const weights = await getModelWeights("g_global_1");

    expect(weights.modelA).toBeGreaterThan(0);
    expect(weights.modelB).toBeGreaterThan(0);
    // modelA has higher avgHits → higher weight
    expect(weights.modelA).toBeGreaterThan(weights.modelB);
  });

  it("returns empty object when no performance stats exist", async () => {
    mockSelect.mockReturnValueOnce(makeChain([]));

    const weights = await getModelWeights("g_empty");

    expect(Object.keys(weights)).toHaveLength(0);
  });
});

describe("getModelWeights — personalization path (with userId)", () => {
  it("returns global weights when fewer than 5 user events exist", async () => {
    const stats = [statRow("modelA", 4, 20), statRow("modelB", 2, 15)];
    // 4 events — below the 5-event threshold
    const events = Array.from({ length: 4 }, () => accuracyEvent({ modelA: 1.0, modelB: 0.0 }));

    // getModelWeights(userId=42) makes two select calls: global stats + user events
    mockSelect
      .mockReturnValueOnce(makeChain(stats))   // global stats query
      .mockReturnValueOnce(makeChain(events));  // user events query (< 5 → fall back to global)

    const weights = await getModelWeights("g_below_thresh_u", 42);

    // Below threshold: falls back to global weights, so modelA (higher avgHits) wins
    expect(Object.keys(weights)).toEqual(expect.arrayContaining(["modelA", "modelB"]));
    expect(weights.modelA).toBeGreaterThan(weights.modelB);
  });

  it("returns blended weights when >= 5 user events exist", async () => {
    const stats = [statRow("modelA", 4, 20), statRow("modelB", 4, 20)]; // equal global
    // 5 events: modelA perfect, modelB zero
    const events = Array.from({ length: 5 }, () => accuracyEvent({ modelA: 1.0, modelB: 0.0 }));

    mockSelect
      .mockReturnValueOnce(makeChain(stats))
      .mockReturnValueOnce(makeChain(events));

    const weights = await getModelWeights("g_blend_1", 42);

    // With equal global weights, the personal signal should push modelA higher
    expect(weights.modelA).toBeGreaterThan(weights.modelB);
  });

  it("blended weights sum to 1.0", async () => {
    const stats = [statRow("modelA", 3, 12), statRow("modelB", 2, 10), statRow("modelC", 4, 20)];
    const events = Array.from({ length: 6 }, () =>
      accuracyEvent({ modelA: 0.8, modelB: 0.5, modelC: 0.3 }),
    );

    mockSelect
      .mockReturnValueOnce(makeChain(stats))
      .mockReturnValueOnce(makeChain(events));

    const weights = await getModelWeights("g_sum_1", 42);

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  it("personal weight (60%) dominates over global (40%) in the blend", async () => {
    // Equal global weights for all models.
    const stats = [statRow("modelA", 4, 20), statRow("modelB", 4, 20)];
    // modelA gets perfect personal score; modelB gets zero.
    const events = Array.from({ length: 5 }, () => accuracyEvent({ modelA: 1.0, modelB: 0.0 }));

    mockSelect
      .mockReturnValueOnce(makeChain(stats))
      .mockReturnValueOnce(makeChain(events));

    const weights = await getModelWeights("g_ratio_1", 42);

    // With equal global weights G:
    //   blendedA = 1.0 * 0.6 + G * 0.4  →  normalizedA > 0.5
    //   blendedB = 0.0 * 0.6 + G * 0.4  →  normalizedB < 0.5
    expect(weights.modelA).toBeGreaterThan(0.5);
    expect(weights.modelB).toBeLessThan(0.5);
    // Ratio reflects 60/40 split: personal pulls modelA far above modelB
    expect(weights.modelA / weights.modelB).toBeGreaterThan(2);
  });
});
