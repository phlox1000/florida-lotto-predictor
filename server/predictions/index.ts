/**
 * Florida Lottery Prediction Engine — 18 models (16 ported from Python + CDM + Chi-Square).
 * All models are pure functions that take a GameConfig + history and return PredictionResult.
 *
 * IMPORTANT: No model uses pure random number generation. Every model either:
 * 1. Produces numbers based on its mathematical formula using historical data, OR
 * 2. Returns an "insufficient_data" flag when it cannot produce formula-based output.
 *
 * The weighted random sampling (weightedSample) is NOT "fake" — it uses probability
 * distributions derived from historical data analysis, which is core to how statistical
 * models work (e.g., Monte Carlo simulation, Bayesian posterior sampling).
 */

export { runAllModels } from "./runAllModels";
export { selectBudgetTickets } from "./selectBudgetTickets";
export { applySumRangeFilter } from "./sumRangeFilter";

export {
  MODEL_REGISTRY, MODEL_IDS, MODEL_META_BY_ID,
  MODEL_DISPLAY_NAMES, MODEL_CATEGORIES,
  type ModelMeta, type ModelCategory,
} from "./modelRegistry";
