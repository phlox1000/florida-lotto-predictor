import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, MODEL_NAMES } from "@shared/lottery";
import { Trophy, Medal, TrendingUp, Target, Zap, BarChart3, ChevronDown, ChevronUp, Crown, Award, Star } from "lucide-react";
import { useState, useMemo } from "react";

const MODEL_DISPLAY_NAMES: Record<string, string> = {
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

const MODEL_CATEGORIES: Record<string, string> = {
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

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">#{rank}</span>;
}

function getRankBorder(rank: number) {
  if (rank === 1) return "border-yellow-400/50 bg-yellow-400/5";
  if (rank === 2) return "border-gray-300/30 bg-gray-300/5";
  if (rank === 3) return "border-amber-600/30 bg-amber-600/5";
  return "border-border/50";
}

function getCategoryColor(category: string) {
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

function ScoreBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Leaderboard() {
  const [viewMode, setViewMode] = useState<"all" | "game">("all");
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"composite" | "avgHits" | "consistency" | "maxHits">("composite");

  const { data: allData, isLoading: allLoading } = trpc.leaderboard.all.useQuery(undefined, {
    enabled: viewMode === "all",
  });

  const { data: gameData, isLoading: gameLoading } = trpc.leaderboard.byGame.useQuery(
    { gameType: selectedGame },
    { enabled: viewMode === "game" }
  );

  const isLoading = viewMode === "all" ? allLoading : gameLoading;

  const sortedModels = useMemo(() => {
    if (viewMode === "all" && allData?.models) {
      return [...allData.models].sort((a, b) => {
        switch (sortBy) {
          case "avgHits": return b.avgMainHits - a.avgMainHits;
          case "consistency": return b.consistency - a.consistency;
          case "maxHits": return b.maxMainHits - a.maxMainHits;
          default: return b.compositeScore - a.compositeScore;
        }
      });
    }
    if (viewMode === "game" && gameData?.models) {
      return gameData.models;
    }
    return [];
  }, [viewMode, allData, gameData, sortBy]);

  const maxComposite = useMemo(() => {
    if (viewMode === "all" && allData?.models) {
      return Math.max(...allData.models.map(m => m.compositeScore), 0.001);
    }
    return 1;
  }, [viewMode, allData]);

  const gameOptions = GAME_TYPES.filter(g => !FLORIDA_GAMES[g].schedule.ended).map(g => FLORIDA_GAMES[g]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="container py-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-yellow-400/20 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-yellow-400" />
              </div>
              <h1 className="text-3xl font-bold">Model Leaderboard</h1>
            </div>
            <p className="text-muted-foreground">
              Ranking all 18 prediction models by historical accuracy against real draw results.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as "all" | "game")}>
              <SelectTrigger className="w-[140px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Games</SelectItem>
                <SelectItem value="game">By Game</SelectItem>
              </SelectContent>
            </Select>

            {viewMode === "game" && (
              <Select value={selectedGame} onValueChange={(v) => setSelectedGame(v as GameType)}>
                <SelectTrigger className="w-[160px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gameOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {viewMode === "all" && (
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[160px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="composite">Composite Score</SelectItem>
                  <SelectItem value="avgHits">Avg Hits</SelectItem>
                  <SelectItem value="consistency">Consistency</SelectItem>
                  <SelectItem value="maxHits">Best Match</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        {viewMode === "all" && allData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{allData.totalEvaluations.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Evaluations</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-yellow-400">{allData.models.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Models Ranked</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-400">
                  {allData.models.length > 0 ? allData.models[0]?.avgMainHits.toFixed(2) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Best Avg Hits</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-accent">
                  {allData.models.length > 0 ? Math.max(...allData.models.map(m => m.maxMainHits)) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Best Single Match</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}

        {/* No Data */}
        {!isLoading && sortedModels.length === 0 && (
          <Card className="bg-card border-border/50">
            <CardContent className="py-16 text-center">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">No Performance Data Yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Generate predictions first, then fetch the latest draw results. The system will automatically
                evaluate each model's accuracy and populate the leaderboard.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Cards */}
        {!isLoading && sortedModels.length > 0 && (
          <div className="space-y-3">
            {sortedModels.map((model, i) => {
              const rank = i + 1;
              const displayName = MODEL_DISPLAY_NAMES[model.modelName] || model.modelName;
              const category = MODEL_CATEGORIES[model.modelName] || "Other";
              const isExpanded = expandedModel === model.modelName;
              const isAllView = viewMode === "all" && "compositeScore" in model;

              return (
                <Card
                  key={model.modelName}
                  className={`bg-card transition-all cursor-pointer hover:border-primary/20 ${getRankBorder(rank)}`}
                  onClick={() => setExpandedModel(isExpanded ? null : model.modelName)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="flex-shrink-0 w-10 flex justify-center">
                        {getRankIcon(rank)}
                      </div>

                      {/* Model Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{displayName}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryColor(category)}`}>
                            {category}
                          </Badge>
                          {model.modelName === "cdm" || model.modelName === "chi_square" ? (
                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0">NEW</Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{model.totalEvaluated} evaluations</span>
                          {isAllView && "consistency" in model && (
                            <span>Consistency: {((model as any).consistency * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 flex-shrink-0">
                        <div className="text-center hidden sm:block">
                          <p className="text-lg font-bold text-primary">{model.avgMainHits.toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">Avg Hits</p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className="text-lg font-bold text-accent">{model.maxMainHits}</p>
                          <p className="text-[10px] text-muted-foreground">Best</p>
                        </div>
                        {isAllView && "compositeScore" in model && (
                          <div className="text-center">
                            <p className="text-lg font-bold text-yellow-400">{(model as any).compositeScore.toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground">Score</p>
                          </div>
                        )}
                        <div className="text-muted-foreground">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Score Bar */}
                    {isAllView && "compositeScore" in model && (
                      <div className="mt-3 px-14">
                        <ScoreBar
                          value={(model as any).compositeScore}
                          max={maxComposite}
                          color={rank === 1 ? "bg-yellow-400" : rank === 2 ? "bg-gray-300" : rank === 3 ? "bg-amber-600" : "bg-primary"}
                        />
                      </div>
                    )}

                    {/* Expanded Details */}
                    {isExpanded && isAllView && "gameBreakdown" in model && (
                      <div className="mt-4 pt-4 border-t border-border/30 px-14">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Main Hits</p>
                            <p className="text-sm font-semibold">{(model as any).totalMainHits}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Special Hits</p>
                            <p className="text-sm font-semibold">{(model as any).totalSpecialHits}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">4+ Matches</p>
                            <p className="text-sm font-semibold text-green-400">{(model as any).perfectMatches}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Zero Matches</p>
                            <p className="text-sm font-semibold text-red-400">{(model as any).zeroMatches}</p>
                          </div>
                        </div>

                        {/* Per-Game Breakdown */}
                        {(model as any).gameBreakdown.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Performance by Game</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(model as any).gameBreakdown.map((g: any) => (
                                <div key={g.gameType} className="flex items-center justify-between bg-muted/10 rounded-md px-3 py-2">
                                  <span className="text-xs font-medium">{FLORIDA_GAMES[g.gameType as GameType]?.name || g.gameType}</span>
                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="text-muted-foreground">{g.total} eval</span>
                                    <span className="text-primary font-semibold">{g.avgHits.toFixed(2)} avg</span>
                                    <span className="text-accent">{g.maxHits} best</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <Card className="bg-card border-border/50 mt-8">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">How Scoring Works</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
              <div>
                <span className="font-semibold text-foreground">Composite Score</span> = Avg Hits (50%) + Consistency (30%) + Best Match (20%)
              </div>
              <div>
                <span className="font-semibold text-foreground">Consistency</span> = % of predictions that matched at least 1 number
              </div>
              <div>
                <span className="font-semibold text-foreground">Evaluations</span> = predictions compared against actual draw results
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
