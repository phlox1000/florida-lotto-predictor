/**
 * modelInsightsService — client-side aggregation layer for model data.
 *
 * Responsibilities:
 *   - Normalize leaderboard data from leaderboard.all / leaderboard.byGame
 *   - Provide per-game ranking with fallback-safe composite score
 *   - Derive consensus strength from ConsensusPanel data
 *   - Surface streak insights from leaderboard.streaks
 *   - Remove UI-level data stitching from page components
 *
 * DO NOT modify backend logic. This is a pure client-side composition layer.
 */

import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { useMemo } from "react";

// ─── Normalized types ─────────────────────────────────────────────────────────

export interface NormalizedModel {
  modelName: string;
  displayName: string;
  category: string;
  rank: number;
  avgMainHits: number;
  maxMainHits: number;
  compositeScore: number;
  consistency: number;
  totalEvaluated: number;
  /** Current hot streak (if any) */
  streak: { count: number; gameType: string } | null;
  /** Games this model excels at */
  affinityTags: Array<{ gameType: string; label: string }>;
  /** Whether this model is on a hot streak */
  isHot: boolean;
}

export interface ModelInsightsSummary {
  /** Ordered list of models (by composite score) */
  models: NormalizedModel[];
  /** Top-ranked model */
  topModel: NormalizedModel | null;
  /** Total evaluations across all models */
  totalEvaluations: number;
  /** Best single-draw match across all models */
  bestSingleMatch: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
  /** View mode: "all" or per-game */
  viewMode: "all" | "game";
}

// ─── Display name + category maps (single source of truth) ───────────────────

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

export function getModelDisplayName(modelName: string): string {
  return MODEL_DISPLAY_NAMES[modelName] ?? modelName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getModelCategory(modelName: string): string {
  return MODEL_CATEGORIES[modelName] ?? "Other";
}

// ─── Category color map ───────────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  Statistical: "bg-blue-500/20 text-blue-400",
  Probabilistic: "bg-purple-500/20 text-purple-400",
  Trend: "bg-green-500/20 text-green-400",
  Pattern: "bg-orange-500/20 text-orange-400",
  Temporal: "bg-cyan-500/20 text-cyan-400",
  Simulation: "bg-red-500/20 text-red-400",
  Sequential: "bg-pink-500/20 text-pink-400",
  Ensemble: "bg-primary/20 text-primary",
  Other: "bg-muted text-muted-foreground",
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}

// ─── Rank helpers ─────────────────────────────────────────────────────────────

export function getRankBorderClass(rank: number): string {
  if (rank === 1) return "border-yellow-400/50 bg-yellow-400/5";
  if (rank === 2) return "border-gray-300/30 bg-gray-300/5";
  if (rank === 3) return "border-amber-600/30 bg-amber-600/5";
  return "border-border/50";
}

export function getRankScoreBarColor(rank: number): string {
  if (rank === 1) return "bg-yellow-400";
  if (rank === 2) return "bg-gray-300";
  if (rank === 3) return "bg-amber-600";
  return "bg-primary";
}

// ─── Consensus strength ───────────────────────────────────────────────────────

export type ConsensusStrength = "strong" | "moderate" | "weak";

export function getConsensusStrength(
  count: number,
  totalModels: number
): ConsensusStrength {
  const pct = totalModels > 0 ? (count / totalModels) * 100 : 0;
  if (pct >= 60) return "strong";
  if (pct >= 35) return "moderate";
  return "weak";
}

export function getConsensusColor(strength: ConsensusStrength): string {
  if (strength === "strong") return "text-green-400";
  if (strength === "moderate") return "text-amber-400";
  return "text-muted-foreground";
}

// ─── Main hook ────────────────────────────────────────────────────────────────

/**
 * useModelInsights — aggregates leaderboard.all + streaks + affinity into
 * a single, normalized NormalizedModel[] array.
 *
 * Use this hook instead of calling leaderboard.all + affinity + streaks
 * separately in page components.
 */
export function useModelInsights(): ModelInsightsSummary {
  const { data: allData, isLoading: allLoading, isError: allError } =
    trpc.leaderboard.all.useQuery(undefined, {
      staleTime: 5 * 60 * 1000, // 5 min
    });

  const { data: streakData } = trpc.leaderboard.streaks.useQuery(
    { minHits: 3 },
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: affinityData } = trpc.leaderboard.affinity.useQuery(undefined, {
    staleTime: 10 * 60 * 1000, // 10 min
  });

  const models = useMemo<NormalizedModel[]>(() => {
    if (!allData?.models) return [];

    // Build lookup maps from supplemental queries
    const streakMap: Record<string, { count: number; gameType: string; isHot: boolean }> = {};
    if (streakData?.allStreaks) {
      for (const s of streakData.allStreaks) {
        const existing = streakMap[s.modelName];
        if (!existing || s.currentStreak > existing.count) {
          streakMap[s.modelName] = {
            count: s.currentStreak,
            gameType: s.gameType,
            isHot: s.isHot,
          };
        }
      }
    }

    const affinityMap: Record<string, Array<{ gameType: string; label: string }>> = {};
    if (affinityData?.models) {
      for (const m of affinityData.models) {
        affinityMap[m.modelName] = m.affinityTags;
      }
    }

    return allData.models.map((m, i): NormalizedModel => {
      const streakEntry = streakMap[m.modelName] ?? null;
      return {
        modelName: m.modelName,
        displayName: getModelDisplayName(m.modelName),
        category: getModelCategory(m.modelName),
        rank: i + 1,
        avgMainHits: m.avgMainHits ?? 0,
        maxMainHits: m.maxMainHits ?? 0,
        compositeScore: (m as any).compositeScore ?? 0,
        consistency: (m as any).consistency ?? 0,
        totalEvaluated: m.totalEvaluated ?? 0,
        streak: streakEntry ? { count: streakEntry.count, gameType: streakEntry.gameType } : null,
        affinityTags: affinityMap[m.modelName] ?? [],
        isHot: streakEntry?.isHot ?? false,
      };
    });
  }, [allData, streakData, affinityData]);

  const topModel = models[0] ?? null;
  const totalEvaluations = allData?.totalEvaluations ?? 0;
  const bestSingleMatch =
    models.length > 0 ? Math.max(...models.map((m) => m.maxMainHits)) : 0;

  return {
    models,
    topModel,
    totalEvaluations,
    bestSingleMatch,
    isLoading: allLoading,
    isError: allError,
    viewMode: "all",
  };
}

/**
 * useModelInsightsByGame — same as useModelInsights but filtered to a specific game.
 */
export function useModelInsightsByGame(gameType: GameType): ModelInsightsSummary {
  const { data: gameData, isLoading, isError } =
    trpc.leaderboard.byGame.useQuery(
      { gameType },
      { staleTime: 5 * 60 * 1000 }
    );

  const { data: streakData } = trpc.leaderboard.streaks.useQuery(
    { minHits: 3 },
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: affinityData } = trpc.leaderboard.affinity.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  const models = useMemo<NormalizedModel[]>(() => {
    if (!gameData?.models) return [];

    const streakMap: Record<string, { count: number; gameType: string; isHot: boolean }> = {};
    if (streakData?.allStreaks) {
      for (const s of streakData.allStreaks) {
        const existing = streakMap[s.modelName];
        if (!existing || s.currentStreak > existing.count) {
          streakMap[s.modelName] = {
            count: s.currentStreak,
            gameType: s.gameType,
            isHot: s.isHot,
          };
        }
      }
    }

    const affinityMap: Record<string, Array<{ gameType: string; label: string }>> = {};
    if (affinityData?.models) {
      for (const m of affinityData.models) {
        affinityMap[m.modelName] = m.affinityTags;
      }
    }

    return gameData.models.map((m, i): NormalizedModel => {
      const streakEntry = streakMap[m.modelName] ?? null;
      return {
        modelName: m.modelName,
        displayName: getModelDisplayName(m.modelName),
        category: getModelCategory(m.modelName),
        rank: i + 1,
        avgMainHits: m.avgMainHits ?? 0,
        maxMainHits: m.maxMainHits ?? 0,
        compositeScore: (m as any).compositeScore ?? 0,
        consistency: (m as any).consistency ?? 0,
        totalEvaluated: m.totalEvaluated ?? 0,
        streak: streakEntry ? { count: streakEntry.count, gameType: streakEntry.gameType } : null,
        affinityTags: affinityMap[m.modelName] ?? [],
        isHot: streakEntry?.isHot ?? false,
      };
    });
  }, [gameData, streakData, affinityData]);

  const topModel = models[0] ?? null;
  const totalEvaluations = models.reduce((sum, m) => sum + m.totalEvaluated, 0);
  const bestSingleMatch =
    models.length > 0 ? Math.max(...models.map((m) => m.maxMainHits)) : 0;

  return {
    models,
    topModel,
    totalEvaluations,
    bestSingleMatch,
    isLoading,
    isError,
    viewMode: "game",
  };
}

// ─── Confidence helpers ───────────────────────────────────────────────────────

/**
 * Derive a human-readable confidence tier from a 0–1 score.
 */
export function getConfidenceTier(score: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  const pct = Math.round(score * 100);
  if (pct >= 70) {
    return { label: "Strong", color: "text-green-400", bgColor: "bg-green-500/20" };
  }
  if (pct >= 50) {
    return { label: "Moderate", color: "text-amber-400", bgColor: "bg-amber-500/20" };
  }
  return { label: "Weak", color: "text-muted-foreground", bgColor: "bg-muted/20" };
}

/**
 * Format a 0–1 confidence score as a percentage string.
 */
export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// ─── Game name helper ─────────────────────────────────────────────────────────

export function getGameName(gameType: string): string {
  return FLORIDA_GAMES[gameType as GameType]?.name ?? gameType;
}
