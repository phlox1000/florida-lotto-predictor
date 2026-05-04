import { describe, it, expect } from "vitest";
import {
  scorePredictionAgainstDraw,
  matchRatioFromCounts,
} from "./scorePrediction";

describe("scorePredictionAgainstDraw", () => {
  it("returns 0 hits and 0 ratio when no numbers match", () => {
    const result = scorePredictionAgainstDraw([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
    expect(result).toEqual({ mainHits: 0, matchRatio: 0 });
  });

  it("returns partial hits and proportional ratio", () => {
    const result = scorePredictionAgainstDraw([1, 2, 3, 4, 5], [1, 2, 99, 98, 97]);
    expect(result.mainHits).toBe(2);
    expect(result.matchRatio).toBeCloseTo(0.4, 5);
  });

  it("returns full hits and ratio of 1 when all numbers match", () => {
    const result = scorePredictionAgainstDraw([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    expect(result).toEqual({ mainHits: 5, matchRatio: 1 });
  });

  it("returns 0 ratio when predicted array is empty", () => {
    const result = scorePredictionAgainstDraw([], [1, 2, 3, 4, 5]);
    expect(result).toEqual({ mainHits: 0, matchRatio: 0 });
  });

  it("returns 0 ratio when actual array is empty", () => {
    const result = scorePredictionAgainstDraw([1, 2, 3], []);
    expect(result).toEqual({ mainHits: 0, matchRatio: 0 });
  });

  it("does not double-count when predicted contains duplicates that both match", () => {
    // Behavior preservation: Array.filter counts each element of `predicted`
    // independently. If the predicted array contains the same number twice
    // and that number is in the draw, both occurrences count. This matches
    // the existing inline behavior at server/db.ts:677-678 exactly.
    const result = scorePredictionAgainstDraw([1, 1, 2], [1, 2, 3]);
    expect(result.mainHits).toBe(3);
    expect(result.matchRatio).toBe(1);
  });
});

describe("matchRatioFromCounts", () => {
  it("returns 0 when totalPicks is 0", () => {
    expect(matchRatioFromCounts(0, 0)).toBe(0);
    expect(matchRatioFromCounts(5, 0)).toBe(0);
  });

  it("returns proportional ratio for partial matches", () => {
    expect(matchRatioFromCounts(2, 5)).toBeCloseTo(0.4, 5);
  });

  it("returns 1 when all picks match", () => {
    expect(matchRatioFromCounts(5, 5)).toBe(1);
  });

  it("returns 0 when no picks match", () => {
    expect(matchRatioFromCounts(0, 5)).toBe(0);
  });

  it("matches scorePredictionAgainstDraw.matchRatio for equivalent inputs", () => {
    const fromArrays = scorePredictionAgainstDraw([1, 2, 3, 4, 5], [1, 2, 99, 98, 97]);
    const fromCounts = matchRatioFromCounts(fromArrays.mainHits, 5);
    expect(fromCounts).toBeCloseTo(fromArrays.matchRatio, 10);
  });
});
