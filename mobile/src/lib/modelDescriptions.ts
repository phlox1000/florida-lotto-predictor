/**
 * Static one-model-per-entry descriptions for the signal intelligence panel.
 * Keyed by canonical model ID (must match PredictionResult.modelName).
 */
export const MODEL_DESCRIPTIONS: Record<string, string> = {
  frequency_baseline:
    "Weights picks by raw historical appearance frequency across all recorded draws. Strong in stable, slow-moving patterns; underperforms when the draw distribution shifts abruptly.",

  poisson_standard:
    "Models each number's appearance as an independent Poisson process at the full historical rate. Reliable when draw frequency follows statistical norms over the long run.",

  poisson_short:
    "Applies Poisson modeling over a short recent window for higher sensitivity to current trends. Fast to adapt but prone to overfitting during volatile draw sequences.",

  poisson_long:
    "Poisson distribution fit over an extended historical window for maximum stability. Slowest to adapt — most useful when long-run frequency is the dominant signal.",

  hot_cold_70:
    "Allocates 70% of picks to hot numbers (high recent frequency) and 30% to cold. Strong when current trends persist; weakens after draw reversals or pattern resets.",

  hot_cold_50:
    "Equal 50/50 split between hot and cold numbers. Balanced approach suited to mixed draw environments where neither trend nor reversal dominates.",

  balanced_hot_cold:
    "Dynamically adjusts the hot/cold weighting ratio based on recent draw variance. Adapts faster than fixed-ratio models at the cost of higher instability.",

  gap_analysis:
    "Selects numbers based on how long ago each last appeared, targeting those most 'due' under overdue-cycle theory. Strong when draws exhibit return-to-mean behavior.",

  cooccurrence:
    "Identifies number pairs and triplets that historically appear together in the same draw. Exploits structural co-selection correlations in the draw data.",

  delta:
    "Analyzes the delta (positional difference) between consecutive sorted draw numbers. Detects recurring spacing patterns that persist across draw sequences.",

  temporal_echo:
    "Identifies numbers that reappear at consistent temporal intervals — weekly, biweekly, or seasonal cycles. Targets echo cycles embedded in draw history.",

  monte_carlo:
    "Generates picks via repeated random sampling weighted by historical frequency. High variance by design — most useful as a stochastic counterweight to deterministic models.",

  markov_chain:
    "Models draws as Markov state transitions: each pick's probability depends on which numbers appeared in the previous draw. Captures short-range sequential dependencies.",

  bayesian:
    "Applies Bayesian posterior updating to compute per-number probability distributions, incorporating both prior frequency and recent draw evidence. Self-corrects as new draws arrive.",

  quantum_entanglement:
    "Treats number pairs as correlated quantum states, applying entanglement-inspired co-selection logic. Experimental high-variance model — widest pick dispersion in the ensemble.",

  cdm:
    "Concentration-Dirichlet Model: allocates draw probabilities across a Dirichlet simplex to capture multi-modal distributions. Strong when draws cluster in non-uniform frequency bands.",

  chi_square:
    "Flags numbers with statistically significant deviation from the expected uniform distribution. Targets anomalous frequency outliers — numbers that are statistically over or under-represented.",

  ai_oracle:
    "Ensemble model combining weighted outputs from all 17 base models. Blend ratios are set by each model's historical accuracy score. The most stable signal in the set.",
};

export function getModelDescription(modelId: string): string {
  return MODEL_DESCRIPTIONS[modelId] ?? "Statistical model generating number picks from historical draw data.";
}
