/**
 * Server-side model registry — extends the shared model metadata with
 * engine-specific details (history requirements, digit game support, etc.).
 *
 * Display names, categories, and colors are defined once in shared/modelMetadata.ts.
 * This file adds server-only metadata that the client doesn't need.
 */

import {
  MODEL_METADATA, MODEL_DISPLAY_NAMES, MODEL_CATEGORIES, MODEL_IDS,
  type ModelCategory, type SharedModelMeta,
} from "../../shared/modelMetadata";

export type { ModelCategory, SharedModelMeta };

export interface ModelMeta extends SharedModelMeta {
  /** Short description of the model's approach */
  description: string;
  /** Minimum number of historical draws required (0 = works with no history) */
  minHistory: number;
  /** Whether the model supports digit games (Pick 2/3/4/5) */
  supportsDigitGames: boolean;
  /** Whether this is a meta/ensemble model that consumes other model outputs */
  isEnsemble: boolean;
  /** Model number in the original engine ordering (1-18) */
  modelNumber: number;
}

const SERVER_META: Record<string, Omit<ModelMeta, keyof SharedModelMeta>> = {
  frequency_baseline:    { description: "Full frequency analysis across all history; deterministic spread when no data",           minHistory: 0,   supportsDigitGames: true,  isEnsemble: false, modelNumber: 1  },
  poisson_standard:      { description: "Poisson probability with 50-draw lookback window",                                       minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 2  },
  poisson_short:         { description: "Poisson probability with 20-draw lookback window",                                       minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 3  },
  poisson_long:          { description: "Poisson probability with 100-draw lookback window",                                      minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 4  },
  hot_cold_70:           { description: "70% hot (frequent) + 30% cold (infrequent) number selection",                            minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 5  },
  hot_cold_50:           { description: "Equal hot/cold split for balanced number selection",                                      minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 6  },
  balanced_hot_cold:     { description: "Hot-Cold 50/50 with capped confidence for conservative play",                            minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 7  },
  gap_analysis:          { description: "Selects numbers with the longest absence from recent draws",                             minHistory: 20,  supportsDigitGames: false, isEnsemble: false, modelNumber: 8  },
  cooccurrence:          { description: "Cluster-based selection from frequently co-appearing number pairs",                      minHistory: 30,  supportsDigitGames: false, isEnsemble: false, modelNumber: 9  },
  delta:                 { description: "Short-term vs long-term frequency delta to find trending numbers",                       minHistory: 101, supportsDigitGames: false, isEnsemble: false, modelNumber: 10 },
  temporal_echo:         { description: "Seasonal pattern detection from same calendar date/month in history",                    minHistory: 1,   supportsDigitGames: false, isEnsemble: false, modelNumber: 11 },
  monte_carlo:           { description: "10,000 frequency-weighted simulations for probability estimation",                       minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 12 },
  markov_chain:          { description: "Transition-probability model based on sequential draw patterns",                         minHistory: 10,  supportsDigitGames: false, isEnsemble: false, modelNumber: 13 },
  bayesian:              { description: "Dirichlet prior with recency-decayed Bayesian updating",                                 minHistory: 1,   supportsDigitGames: false, isEnsemble: false, modelNumber: 14 },
  quantum_entanglement:  { description: "Pair-correlation clustering to find strongly entangled number groups",                   minHistory: 30,  supportsDigitGames: false, isEnsemble: false, modelNumber: 15 },
  cdm:                   { description: "Compound-Dirichlet-Multinomial with position-aware inter-position dependencies",         minHistory: 30,  supportsDigitGames: false, isEnsemble: false, modelNumber: 16 },
  chi_square:            { description: "Chi-square test detecting statistically anomalous frequency deviations",                 minHistory: 20,  supportsDigitGames: false, isEnsemble: false, modelNumber: 17 },
  ai_oracle:             { description: "Weighted meta-ensemble vote across all sibling model outputs",                           minHistory: 0,   supportsDigitGames: false, isEnsemble: true,  modelNumber: 18 },
};

/**
 * All 18 prediction models with full server-side metadata, in canonical execution order.
 */
export const MODEL_REGISTRY: readonly ModelMeta[] = MODEL_METADATA.map(shared => ({
  ...shared,
  ...SERVER_META[shared.id],
}));

/** Quick lookup: model ID → full server metadata */
export const MODEL_META_BY_ID: Record<string, ModelMeta> = Object.fromEntries(
  MODEL_REGISTRY.map(m => [m.id, m])
);

export { MODEL_DISPLAY_NAMES, MODEL_CATEGORIES, MODEL_IDS };
