/**
 * Shared model metadata — single source of truth for model identity, display names,
 * categories, and colors. Safe for import by both client and server.
 *
 * IMPORTANT: Model IDs here must match the engine output (PredictionResult.modelName)
 * exactly. The canonical ID for Model 1 is "frequency_baseline" (not the legacy
 * "random" alias that was previously used in shared/lottery.ts).
 */

export type ModelCategory =
  | "Statistical"
  | "Probabilistic"
  | "Trend"
  | "Pattern"
  | "Temporal"
  | "Simulation"
  | "Sequential"
  | "Ensemble";

export interface SharedModelMeta {
  id: string;
  displayName: string;
  category: ModelCategory;
  color: string;
}

export const MODEL_METADATA: readonly SharedModelMeta[] = [
  { id: "frequency_baseline", displayName: "Frequency Baseline",     category: "Statistical",   color: "#6366f1" },
  { id: "poisson_standard",   displayName: "Poisson Standard",       category: "Probabilistic", color: "#8b5cf6" },
  { id: "poisson_short",      displayName: "Poisson Short-Window",   category: "Probabilistic", color: "#a78bfa" },
  { id: "poisson_long",       displayName: "Poisson Long-Window",    category: "Probabilistic", color: "#7c3aed" },
  { id: "hot_cold_70",        displayName: "Hot-Cold 70/30",         category: "Trend",         color: "#22c55e" },
  { id: "hot_cold_50",        displayName: "Hot-Cold 50/50",         category: "Trend",         color: "#4ade80" },
  { id: "balanced_hot_cold",  displayName: "Balanced Hot-Cold",      category: "Trend",         color: "#16a34a" },
  { id: "gap_analysis",       displayName: "Gap Analysis",           category: "Trend",         color: "#84cc16" },
  { id: "cooccurrence",       displayName: "Co-Occurrence",          category: "Pattern",       color: "#f97316" },
  { id: "delta",              displayName: "Delta Frequency",        category: "Trend",         color: "#eab308" },
  { id: "temporal_echo",      displayName: "Temporal Echo",          category: "Temporal",      color: "#06b6d4" },
  { id: "monte_carlo",        displayName: "Monte Carlo",            category: "Simulation",    color: "#ef4444" },
  { id: "markov_chain",       displayName: "Markov Chain",           category: "Sequential",    color: "#ec4899" },
  { id: "bayesian",           displayName: "Bayesian Posterior",     category: "Probabilistic", color: "#d946ef" },
  { id: "quantum_entanglement", displayName: "Quantum Entanglement", category: "Pattern",       color: "#f59e0b" },
  { id: "cdm",                displayName: "CDM (Dirichlet)",        category: "Probabilistic", color: "#14b8a6" },
  { id: "chi_square",         displayName: "Chi-Square Anomaly",     category: "Statistical",   color: "#3b82f6" },
  { id: "ai_oracle",          displayName: "AI Oracle Ensemble",     category: "Ensemble",      color: "#fbbf24" },
] as const;

/** All canonical model IDs in execution order */
export const MODEL_IDS = MODEL_METADATA.map(m => m.id);

/** Model ID → display name */
export const MODEL_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  MODEL_METADATA.map(m => [m.id, m.displayName])
);

/** Model ID → category */
export const MODEL_CATEGORIES: Record<string, string> = Object.fromEntries(
  MODEL_METADATA.map(m => [m.id, m.category])
);

/** Model ID → chart color */
export const MODEL_COLORS: Record<string, string> = Object.fromEntries(
  MODEL_METADATA.map(m => [m.id, m.color])
);

/**
 * Resolve a model name to its display name, handling the legacy "random" alias.
 * Use this when displaying model names from any data source (DB, API responses, etc.)
 */
export function getModelDisplayName(modelName: string): string {
  if (modelName === "random") return MODEL_DISPLAY_NAMES["frequency_baseline"];
  return MODEL_DISPLAY_NAMES[modelName] || modelName;
}

/**
 * Resolve a model name to its category, handling the legacy "random" alias.
 */
export function getModelCategory(modelName: string): string {
  if (modelName === "random") return MODEL_CATEGORIES["frequency_baseline"];
  return MODEL_CATEGORIES[modelName] || "Other";
}

/**
 * Resolve a model name to its chart color, handling the legacy "random" alias.
 */
export function getModelColor(modelName: string): string {
  if (modelName === "random") return MODEL_COLORS["frequency_baseline"];
  return MODEL_COLORS[modelName] || "#888";
}
