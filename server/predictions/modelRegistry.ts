/**
 * Centralized model registry — single source of truth for prediction model metadata.
 *
 * NOTE: The shared/lottery.ts MODEL_NAMES array uses "random" for the frequency
 * baseline model, but the engine itself emits "frequency_baseline". Both are kept
 * for backward compatibility. The authoritative identifier is `id` in this registry.
 */

export type ModelCategory =
  | "statistical"
  | "probabilistic"
  | "trend"
  | "pattern"
  | "temporal"
  | "simulation"
  | "sequential"
  | "ensemble";

export interface ModelMeta {
  /** Stable identifier emitted by the engine in PredictionResult.modelName */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description of the model's approach */
  description: string;
  /** Grouping category */
  category: ModelCategory;
  /** Minimum number of historical draws required (0 = works with no history) */
  minHistory: number;
  /** Whether the model supports digit games (Pick 2/3/4/5) */
  supportsDigitGames: boolean;
  /** Whether this is a meta/ensemble model that consumes other model outputs */
  isEnsemble: boolean;
  /** Model number in the original engine ordering (1-18) */
  modelNumber: number;
}

/**
 * All 18 prediction models in their canonical execution order.
 * The order here matches runAllModels.ts exactly.
 */
export const MODEL_REGISTRY: readonly ModelMeta[] = [
  {
    id: "frequency_baseline",
    displayName: "Frequency Baseline",
    description: "Full frequency analysis across all history; deterministic spread when no data",
    category: "statistical",
    minHistory: 0,
    supportsDigitGames: true,
    isEnsemble: false,
    modelNumber: 1,
  },
  {
    id: "poisson_standard",
    displayName: "Poisson Standard",
    description: "Poisson probability with 50-draw lookback window",
    category: "probabilistic",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 2,
  },
  {
    id: "poisson_short",
    displayName: "Poisson Short-Window",
    description: "Poisson probability with 20-draw lookback window",
    category: "probabilistic",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 3,
  },
  {
    id: "poisson_long",
    displayName: "Poisson Long-Window",
    description: "Poisson probability with 100-draw lookback window",
    category: "probabilistic",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 4,
  },
  {
    id: "hot_cold_70",
    displayName: "Hot-Cold 70/30",
    description: "70% hot (frequent) + 30% cold (infrequent) number selection",
    category: "trend",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 5,
  },
  {
    id: "hot_cold_50",
    displayName: "Hot-Cold 50/50",
    description: "Equal hot/cold split for balanced number selection",
    category: "trend",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 6,
  },
  {
    id: "balanced_hot_cold",
    displayName: "Balanced Hot-Cold",
    description: "Hot-Cold 50/50 with capped confidence for conservative play",
    category: "trend",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 7,
  },
  {
    id: "gap_analysis",
    displayName: "Gap Analysis",
    description: "Selects numbers with the longest absence from recent draws",
    category: "trend",
    minHistory: 20,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 8,
  },
  {
    id: "cooccurrence",
    displayName: "Co-Occurrence",
    description: "Cluster-based selection from frequently co-appearing number pairs",
    category: "pattern",
    minHistory: 30,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 9,
  },
  {
    id: "delta",
    displayName: "Delta Frequency",
    description: "Short-term vs long-term frequency delta to find trending numbers",
    category: "trend",
    minHistory: 101,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 10,
  },
  {
    id: "temporal_echo",
    displayName: "Temporal Echo",
    description: "Seasonal pattern detection from same calendar date/month in history",
    category: "temporal",
    minHistory: 1,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 11,
  },
  {
    id: "monte_carlo",
    displayName: "Monte Carlo",
    description: "10,000 frequency-weighted simulations for probability estimation",
    category: "simulation",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 12,
  },
  {
    id: "markov_chain",
    displayName: "Markov Chain",
    description: "Transition-probability model based on sequential draw patterns",
    category: "sequential",
    minHistory: 10,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 13,
  },
  {
    id: "bayesian",
    displayName: "Bayesian Posterior",
    description: "Dirichlet prior with recency-decayed Bayesian updating",
    category: "probabilistic",
    minHistory: 1,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 14,
  },
  {
    id: "quantum_entanglement",
    displayName: "Quantum Entanglement",
    description: "Pair-correlation clustering to find strongly entangled number groups",
    category: "pattern",
    minHistory: 30,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 15,
  },
  {
    id: "cdm",
    displayName: "CDM (Dirichlet)",
    description: "Compound-Dirichlet-Multinomial with position-aware inter-position dependencies",
    category: "probabilistic",
    minHistory: 30,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 16,
  },
  {
    id: "chi_square",
    displayName: "Chi-Square Anomaly",
    description: "Chi-square test detecting statistically anomalous frequency deviations",
    category: "statistical",
    minHistory: 20,
    supportsDigitGames: false,
    isEnsemble: false,
    modelNumber: 17,
  },
  {
    id: "ai_oracle",
    displayName: "AI Oracle Ensemble",
    description: "Weighted meta-ensemble vote across all sibling model outputs",
    category: "ensemble",
    minHistory: 0,
    supportsDigitGames: false,
    isEnsemble: true,
    modelNumber: 18,
  },
] as const;

/** All model IDs in canonical execution order */
export const MODEL_IDS = MODEL_REGISTRY.map(m => m.id);

/** Quick lookup: model ID → metadata */
export const MODEL_META_BY_ID: Record<string, ModelMeta> = Object.fromEntries(
  MODEL_REGISTRY.map(m => [m.id, m])
);

/** Quick lookup: model ID → display name */
export const MODEL_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  MODEL_REGISTRY.map(m => [m.id, m.displayName])
);

/** Quick lookup: model ID → category */
export const MODEL_CATEGORIES: Record<string, ModelCategory> = Object.fromEntries(
  MODEL_REGISTRY.map(m => [m.id, m.category])
);
