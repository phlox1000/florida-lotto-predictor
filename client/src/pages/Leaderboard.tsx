import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getModelDisplayName, getModelCategory, getModelColor } from "@shared/modelMetadata";
import { Trophy, Medal, TrendingUp, Target, Zap, BarChart3, ChevronDown, ChevronUp, Crown, Award, Star, LineChart as LineChartIcon, Eye, EyeOff, Flame, Gamepad2 } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { RefreshCw } from "lucide-react";

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


function ModelTrendsChart() {
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [weeksBack, setWeeksBack] = useState(12);
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  const gameType = selectedGame === "all" ? undefined : selectedGame;
  const { data: trendsData, isLoading } = trpc.leaderboard.trends.useQuery(
    { gameType: gameType as GameType | undefined, weeksBack },
    { placeholderData: (prev) => prev }
  );

  const toggleModel = useCallback((modelName: string) => {
    setHiddenModels(prev => {
      const next = new Set(prev);
      if (next.has(modelName)) next.delete(modelName);
      else next.add(modelName);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!trendsData) return;
    const allModels = Object.keys(trendsData.models);
    setHiddenModels(prev => {
      if (prev.size === allModels.length) return new Set();
      return new Set(allModels);
    });
  }, [trendsData]);

  // Transform data for Recharts: each week is a data point with model names as keys
  const chartData = useMemo(() => {
    if (!trendsData || trendsData.weeks.length === 0) return [];
    return trendsData.weeks.map(week => {
      const point: Record<string, string | number> = { week: new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
      for (const [model, dataPoints] of Object.entries(trendsData.models)) {
        const match = dataPoints.find(d => d.week === week);
        if (match) point[model] = match.avgHits;
      }
      return point;
    });
  }, [trendsData]);

  const visibleModels = useMemo(() => {
    if (!trendsData) return [];
    return Object.keys(trendsData.models).filter(m => !hiddenModels.has(m));
  }, [trendsData, hiddenModels]);

  const gameOptions = GAME_TYPES.filter(g => !FLORIDA_GAMES[g].schedule.ended);

  return (
    <Card className="bg-card border-border/50 mt-8">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <LineChartIcon className="w-5 h-5 text-primary" />
            Model Accuracy Trends
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedGame} onValueChange={setSelectedGame}>
              <SelectTrigger className="w-[140px] bg-card h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Games</SelectItem>
                {gameOptions.map(g => (
                  <SelectItem key={g} value={g}>{FLORIDA_GAMES[g].name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(weeksBack)} onValueChange={(v) => setWeeksBack(Number(v))}>
              <SelectTrigger className="w-[110px] bg-card h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 Weeks</SelectItem>
                <SelectItem value="8">8 Weeks</SelectItem>
                <SelectItem value="12">12 Weeks</SelectItem>
                <SelectItem value="24">24 Weeks</SelectItem>
                <SelectItem value="52">52 Weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : chartData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No trend data yet. Run predictions and backfill evaluations to see accuracy trends.</p>
          </div>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={[0, 'auto']} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    itemStyle={{ padding: "1px 0" }}
                  />
                  {visibleModels.map(model => (
                    <Line
                      key={model}
                      type="monotone"
                      dataKey={model}
                      name={getModelDisplayName(model)}
                      stroke={getModelColor(model)}
                      strokeWidth={model === "ai_oracle" ? 3 : 1.5}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Interactive Legend */}
            <div className="mt-4 pt-3 border-t border-border/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Toggle Models</p>
                <Button variant="ghost" size="sm" onClick={toggleAll} className="h-6 text-xs px-2">
                  {hiddenModels.size === Object.keys(trendsData?.models || {}).length ? "Show All" : "Hide All"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(trendsData?.models || {}).map(model => {
                  const isHidden = hiddenModels.has(model);
                  const color = getModelColor(model);
                  return (
                    <button
                      key={model}
                      onClick={() => toggleModel(model)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all border ${
                        isHidden
                          ? "opacity-40 border-border/30 bg-transparent text-muted-foreground"
                          : "border-border/50 bg-secondary/30"
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: isHidden ? "transparent" : color, border: `1.5px solid ${color}` }} />
                      {getModelDisplayName(model)}
                      {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HotStreakBanner({ hotStreaks }: { hotStreaks: Array<{ modelName: string; gameType: string; currentStreak: number }> }) {
  if (hotStreaks.length === 0) return null;
  return (
    <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30 mb-6">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
          <span className="font-semibold text-orange-400">Hot Streaks Active</span>
          <Badge className="bg-orange-500/20 text-orange-400 text-[10px]">{hotStreaks.length} model{hotStreaks.length > 1 ? "s" : ""}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {hotStreaks.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-orange-500/10 rounded-lg px-3 py-1.5 border border-orange-500/20">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs font-medium text-foreground">{getModelDisplayName(s.modelName)}</span>
              <span className="text-[10px] text-muted-foreground">on {FLORIDA_GAMES[s.gameType as GameType]?.name || s.gameType}</span>
              <Badge className="bg-red-500/20 text-red-400 text-[10px] ml-1">{s.currentStreak} in a row</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Leaderboard() {
  const [viewMode, setViewMode] = useState<"all" | "game">("all");
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"composite" | "avgHits" | "consistency" | "maxHits">("composite");
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const { user } = useAuth();
  const isOwner = user?.role === "admin";
  const utils = trpc.useUtils();

  // Fetch affinity tags and streaks
  const { data: affinityData } = trpc.leaderboard.affinity.useQuery();
  const { data: streakData } = trpc.leaderboard.streaks.useQuery({ minHits: 3 });

  // Build lookup maps
  const affinityMap = useMemo(() => {
    const map: Record<string, Array<{ gameType: string; label: string }>> = {};
    if (affinityData?.models) {
      for (const m of affinityData.models) {
        map[m.modelName] = m.affinityTags;
      }
    }
    return map;
  }, [affinityData]);

  const streakMap = useMemo(() => {
    const map: Record<string, { currentStreak: number; gameType: string; isHot: boolean }> = {};
    if (streakData?.allStreaks) {
      for (const s of streakData.allStreaks) {
        // Keep the best current streak per model
        if (!map[s.modelName] || s.currentStreak > map[s.modelName].currentStreak) {
          map[s.modelName] = { currentStreak: s.currentStreak, gameType: s.gameType, isHot: s.isHot };
        }
      }
    }
    return map;
  }, [streakData]);

  const backfillMutation = trpc.leaderboard.backfill.useMutation();
  const [isBackfilling, setIsBackfilling] = useState(false);

  const runBackfill = async () => {
    setIsBackfilling(true);
    let totalEval = 0;
    let totalSkip = 0;
    const games = GAME_TYPES.filter(g => !FLORIDA_GAMES[g].schedule.ended);
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      setBackfillStatus(`Processing ${FLORIDA_GAMES[g].name} (${i + 1}/${games.length})...`);
      try {
        const result = await backfillMutation.mutateAsync({ gameType: g as GameType, sampleSize: 10 });
        totalEval += result.evaluated;
        totalSkip += result.skipped;
      } catch (err: any) {
        console.error(`Backfill error for ${g}:`, err);
      }
    }
    setBackfillStatus(`Done! Evaluated ${totalEval} predictions (${totalSkip} already existed)`);
    utils.leaderboard.all.invalidate();
    utils.leaderboard.byGame.invalidate();
    setIsBackfilling(false);
    setTimeout(() => setBackfillStatus(null), 8000);
  };

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

          <div className="flex items-center gap-3 flex-wrap">
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={runBackfill}
                disabled={isBackfilling}
                className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isBackfilling ? "animate-spin" : ""}`} />
                {isBackfilling ? "Evaluating..." : "Backfill Evaluations"}
              </Button>
            )}
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

        {/* Hot Streak Banner */}
        {streakData?.hotStreaks && streakData.hotStreaks.length > 0 && (
          <HotStreakBanner hotStreaks={streakData.hotStreaks} />
        )}

        {/* Backfill Status */}
        {backfillStatus && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
            {backfillStatus}
          </div>
        )}

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
              {isOwner && (
                <Button
                  variant="outline"
                  className="mt-4 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                  onClick={runBackfill}
                  disabled={isBackfilling}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isBackfilling ? "animate-spin" : ""}`} />
                  {isBackfilling ? "Evaluating..." : "Backfill All Evaluations"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Cards */}
        {!isLoading && sortedModels.length > 0 && (
          <div className="space-y-3">
            {sortedModels.map((model, i) => {
              const rank = i + 1;
              const displayName = getModelDisplayName(model.modelName);
              const category = getModelCategory(model.modelName);
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
                          {/* Game Affinity Tags */}
                          {affinityMap[model.modelName]?.map((tag, ti) => (
                            <Badge key={ti} className={`text-[10px] px-1.5 py-0 ${tag.label === "Best" ? "bg-emerald-500/20 text-emerald-400" : "bg-sky-500/20 text-sky-400"}`}>
                              <Gamepad2 className="w-2.5 h-2.5 mr-0.5" />
                              {tag.label}: {FLORIDA_GAMES[tag.gameType as GameType]?.name || tag.gameType}
                            </Badge>
                          ))}
                          {/* Streak Badge */}
                          {streakMap[model.modelName]?.isHot && (
                            <Badge className="bg-orange-500/20 text-orange-400 text-[10px] px-1.5 py-0 animate-pulse">
                              <Flame className="w-2.5 h-2.5 mr-0.5" />
                              {streakMap[model.modelName].currentStreak} Streak
                            </Badge>
                          )}
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

        {/* Model Confidence Trends Chart */}
        <ModelTrendsChart />

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
