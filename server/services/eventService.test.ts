import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsertValues, mockInsert, mockDb } = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockDb = { insert: mockInsert };
  return { mockInsertValues, mockInsert, mockDb };
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

import {
  emitPredictionGenerated,
  emitPredictionActedOn,
  emitPredictionAccuracyCalculated,
  emitDrawResultEntered,
  buildPredictionCorrelationId,
  buildDrawCorrelationId,
} from "./eventService";
import { getDb } from "../db";

const baseInput = {
  userId: 42,
  game: "fantasy_5",
  correlationId: "prediction:fantasy_5:42:1714000000000",
  modelWeights: { frequencyPoisson: 0.8, hotColdGapDelta: 0.6 },
  picks: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]],
  confidenceScore: 0,
  platformVersion: "1.0.0",
  schemaVersion: "1.0",
  occurredAt: new Date("2026-04-22T12:00:00Z"),
};

describe("emitPredictionGenerated", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockInsertValues.mockResolvedValue([]);
  });

  it("inserts a row with event_type prediction_generated", async () => {
    await emitPredictionGenerated(baseInput);

    expect(mockInsert).toHaveBeenCalledOnce();
    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.event_type).toBe("prediction_generated");
    expect(insertedValues.user_id).toBe(42);
    expect(insertedValues.app_id).toBe("florida-lotto");
    expect(insertedValues.correlation_id).toBe(baseInput.correlationId);
    expect((insertedValues.payload as any).game).toBe("fantasy_5");
    expect((insertedValues.payload as any).picks).toEqual(baseInput.picks);
  });

  it("resolves silently when the database insert throws", async () => {
    mockInsertValues.mockRejectedValueOnce(new Error("DB connection lost"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(emitPredictionGenerated(baseInput)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[eventService]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("resolves silently when getDb returns null (no DB connection)", async () => {
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(emitPredictionGenerated(baseInput)).resolves.toBeUndefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("buildPredictionCorrelationId", () => {
  it("returns the correct format string", () => {
    const id = buildPredictionCorrelationId(99, "powerball", 1714000000000);
    expect(id).toBe("prediction:powerball:99:1714000000000");
  });
});

describe("emitPredictionActedOn", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockInsertValues.mockResolvedValue([]);
  });

  it("inserts a row with event_type prediction_acted_on", async () => {
    await emitPredictionActedOn({
      userId: 7,
      correlationId: "prediction:fantasy_5:7:1714000000000",
      action: "purchased",
      ticketCost: 2.00,
      occurredAt: new Date("2026-04-22T12:00:00Z"),
      platformVersion: "1.0.0",
      schemaVersion: "1.0",
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted.event_type).toBe("prediction_acted_on");
    expect(inserted.user_id).toBe(7);
    expect((inserted.payload as any).action).toBe("purchased");
    expect((inserted.payload as any).ticket_cost).toBe(2.00);
  });

  it("payload contains ticketCost and action", async () => {
    await emitPredictionActedOn({
      userId: 7,
      correlationId: "prediction:fantasy_5:7:1714000000000",
      action: "modified",
      ticketCost: 4.00,
      modifiedPicks: [[3, 7, 12, 18, 22]],
      occurredAt: new Date("2026-04-22T12:00:00Z"),
      platformVersion: "1.0.0",
      schemaVersion: "1.0",
    });

    const inserted = mockInsertValues.mock.calls[0][0];
    expect((inserted.payload as any).ticket_cost).toBe(4.00);
    expect((inserted.payload as any).action).toBe("modified");
    expect((inserted.payload as any).modified_picks).toEqual([[3, 7, 12, 18, 22]]);
  });

  it("resolves silently when the database insert throws", async () => {
    mockInsertValues.mockRejectedValueOnce(new Error("connection refused"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(emitPredictionActedOn({
      userId: 7,
      correlationId: "prediction:fantasy_5:7:1714000000000",
      action: "purchased",
      ticketCost: 2.00,
      occurredAt: new Date(),
      platformVersion: "1.0.0",
      schemaVersion: "1.0",
    })).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[eventService]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});

describe("emitDrawResultEntered", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockInsertValues.mockResolvedValue([]);
  });

  it("inserts a row with event_type draw_result_entered", async () => {
    await emitDrawResultEntered({
      userId: 5,
      game: "fantasy_5",
      drawDate: "2026-04-22",
      winningNumbers: [3, 14, 21, 28, 35],
      occurredAt: new Date("2026-04-22T23:00:00Z"),
      platformVersion: "1.0.0",
      schemaVersion: "1.0",
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted.event_type).toBe("draw_result_entered");
    expect(inserted.user_id).toBe(5);
    expect((inserted.payload as any).winning_numbers).toEqual([3, 14, 21, 28, 35]);
  });

  it("correlation_id follows the draw:{game}:{drawDate} format", async () => {
    await emitDrawResultEntered({
      userId: null,
      game: "mega_millions",
      drawDate: "2026-04-23",
      winningNumbers: [10, 20, 30, 40, 50],
      occurredAt: new Date(),
      platformVersion: "1.0.0",
      schemaVersion: "1.0",
    });

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted.correlation_id).toBe("draw:mega_millions:2026-04-23");
  });

  it("handles userId null without error", async () => {
    await expect(emitDrawResultEntered({
      userId: null,
      game: "fantasy_5",
      drawDate: "2026-04-22",
      winningNumbers: [1, 2, 3, 4, 5],
      occurredAt: new Date(),
      platformVersion: "1.0.0",
      schemaVersion: "1.0",
    })).resolves.toBeUndefined();

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted.user_id).toBeNull();
  });
});

describe("buildDrawCorrelationId", () => {
  it("returns the correct draw:{game}:{drawDate} format", () => {
    expect(buildDrawCorrelationId("fantasy_5", "2026-04-23")).toBe("draw:fantasy_5:2026-04-23");
  });
});

describe("emitPredictionAccuracyCalculated", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockInsertValues.mockResolvedValue([]);
  });

  const accuracyInput = {
    userId: 11,
    correlationId: "prediction:fantasy_5:11:1714000000000",
    triggeredBy: "draw:fantasy_5:2026-04-22",
    matchedNumbers: 3,
    totalPicks: 5,
    netOutcome: 0,
    modelScores: { frequencyPoisson: 0.6, hotColdGapDelta: 0.4 },
    occurredAt: new Date("2026-04-22T23:30:00Z"),
    platformVersion: "1.0.0",
    schemaVersion: "1.0",
  };

  it("inserts a row with event_type prediction_accuracy_calculated", async () => {
    await emitPredictionAccuracyCalculated(accuracyInput);

    expect(mockInsert).toHaveBeenCalledOnce();
    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted.event_type).toBe("prediction_accuracy_calculated");
    expect(inserted.user_id).toBe(11);
    expect(inserted.correlation_id).toBe(accuracyInput.correlationId);
    expect((inserted.payload as any).matched_numbers).toBe(3);
    expect((inserted.payload as any).total_picks).toBe(5);
  });

  it("triggeredBy is present in the payload", async () => {
    await emitPredictionAccuracyCalculated(accuracyInput);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect((inserted.payload as any).triggered_by).toBe("draw:fantasy_5:2026-04-22");
    expect((inserted.payload as any).model_scores).toEqual(accuracyInput.modelScores);
  });

  it("resolves silently when the database insert throws", async () => {
    mockInsertValues.mockRejectedValueOnce(new Error("write timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(emitPredictionAccuracyCalculated(accuracyInput)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[eventService]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
