/** Display names and categories for prediction models — shared by leaderboard UIs */

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  random: "Frequency Baseline",
  poisson_standard: "Poisson Standard",
  poisson_short: "Poisson Short-Window",
  poisson_long: "Poisson Long-Window",
  hot_cold_70: "Hot-Cold 70/30",
  hot_cold_50: "Hot-Cold 50/50",
  balanced_hot_cold: "Balanced Hot-Cold",
  gap_analysis: "Gap Analysis",
  cooccurrence: "Co-Occurrence",
  delta: "Delta Frequency",
  temporal_echo: "Temporal Echo",
  monte_carlo: "Monte Carlo",
  markov_chain: "Markov Chain",
  bayesian: "Bayesian Posterior",
  quantum_entanglement: "Quantum Entanglement",
  cdm: "CDM (Dirichlet)",
  chi_square: "Chi-Square Anomaly",
  ai_oracle: "AI Oracle Ensemble",
};

export const MODEL_CATEGORIES: Record<string, string> = {
  random: "Statistical",
  poisson_standard: "Probabilistic",
  poisson_short: "Probabilistic",
  poisson_long: "Probabilistic",
  hot_cold_70: "Trend",
  hot_cold_50: "Trend",
  balanced_hot_cold: "Trend",
  gap_analysis: "Trend",
  cooccurrence: "Pattern",
  delta: "Trend",
  temporal_echo: "Temporal",
  monte_carlo: "Simulation",
  markov_chain: "Sequential",
  bayesian: "Probabilistic",
  quantum_entanglement: "Pattern",
  cdm: "Probabilistic",
  chi_square: "Statistical",
  ai_oracle: "Ensemble",
};

export function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    Statistical: "bg-blue-500/20 text-blue-400",
    Probabilistic: "bg-purple-500/20 text-purple-400",
    Trend: "bg-green-500/20 text-green-400",
    Pattern: "bg-orange-500/20 text-orange-400",
    Temporal: "bg-cyan-500/20 text-cyan-400",
    Simulation: "bg-red-500/20 text-red-400",
    Sequential: "bg-pink-500/20 text-pink-400",
    Ensemble: "bg-primary/20 text-primary",
  };
  return colors[category] || "bg-muted text-muted-foreground";
}
