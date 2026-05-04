/**
 * Canonical lottery match-ratio scoring.
 *
 * Mirrors the inline scoring logic that lives in:
 *   - server/db.ts evaluatePredictionsAgainstDraw (per-prediction hits)
 *   - server/db.ts evaluatePredictionsAgainstDraw (modelScores payload)
 *   - server/services/eventService.ts (match_ratio fallback in emit path)
 *
 * IMPORTANT INVARIANTS (preserved from the live path):
 *   - matchRatio is MAIN-NUMBERS-ONLY. Special numbers are tracked
 *     separately in model_performance.specialHits but do NOT contribute
 *     to matchRatio. Any future change to this contract must update all
 *     three callers and is out of scope for this refactor.
 *   - When the predicted array is empty (length 0), matchRatio is 0.
 *     This matches the existing inline guard `predMain.length > 0 ? ... : 0`.
 */

/**
 * Score a prediction's main numbers against an actual draw's main numbers.
 *
 * Returns both the raw hit count (used by model_performance.mainHits) and
 * the normalized ratio (used by accuracy event payload model_scores and
 * match_ratio).
 */
export function scorePredictionAgainstDraw(
  predictedMainNumbers: number[],
  actualMainNumbers: number[],
): { mainHits: number; matchRatio: number } {
  const actualSet = new Set(actualMainNumbers);
  const mainHits = predictedMainNumbers.filter((n) => actualSet.has(n)).length;
  const matchRatio =
    predictedMainNumbers.length > 0 ? mainHits / predictedMainNumbers.length : 0;
  return { mainHits, matchRatio };
}

/**
 * Compute matchRatio when only the hit count and total pick count are known.
 *
 * Used by the event-service fallback path where the prediction array is
 * not retained — only the counts. Behavior is identical to:
 *   scorePredictionAgainstDraw(...).matchRatio
 * given the same hits/total.
 */
export function matchRatioFromCounts(
  matchedNumbers: number,
  totalPicks: number,
): number {
  return totalPicks > 0 ? matchedNumbers / totalPicks : 0;
}
