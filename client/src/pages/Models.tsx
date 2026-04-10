import { GameContextHeader } from "@/components/predictions/GameContextHeader";
import { ModelLeaderboardRow } from "@/components/predictions/ModelLeaderboardRow";
import { MODEL_DISPLAY_NAMES } from "@/components/predictions/modelMeta";
import Navbar from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { BarChart3, Flame, Layers, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type PerfRow = RouterOutputs["performance"]["stats"][number];

export default function Models() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: scheduleRows, isLoading: scheduleLoading } = trpc.schedule.all.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const { data: allData, isLoading: allLoading } = trpc.leaderboard.all.useQuery();
  const { data: gameData, isLoading: gameLoading } = trpc.leaderboard.byGame.useQuery(
    { gameType: selectedGame },
    { placeholderData: prev => prev }
  );
  const { data: streakData } = trpc.leaderboard.streaks.useQuery({ minHits: 3 });
  const { data: perfStats, isLoading: perfLoading } = trpc.performance.stats.useQuery({ gameType: selectedGame });
  const { data: weights } = trpc.performance.weights.useQuery({ gameType: selectedGame });

  const isLoading = allLoading || gameLoading;

  const allModels = allData?.models ?? [];
  const gameModels = gameData?.models ?? [];

  const allModelMap = useMemo(() => {
    const m = new Map<string, (typeof allModels)[number]>();
    for (const row of allModels) m.set(row.modelName, row);
    return m;
  }, [allModels]);

  const perfByModel = useMemo(() => {
    const m = new Map<string, PerfRow>();
    for (const row of perfStats ?? []) m.set(row.modelName, row);
    return m;
  }, [perfStats]);

  const hasGlobalData = (allData?.totalEvaluations ?? 0) > 0 && allModels.length > 0;
  const hasGameData = gameModels.some(g => g.totalEvaluated > 0);

  const topGlobal = hasGlobalData ? allModels[0] : null;

  const consensusSummary = useMemo(() => {
    const w = weights ?? {};
    const vals = Object.values(w);
    if (vals.length === 0) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = Math.max(...vals) - Math.min(...vals);
    return { avg, spread };
  }, [weights]);

  const bestRecent = useMemo(() => {
    const hot = streakData?.hotStreaks ?? [];
    const pool = hot.length > 0 ? hot : (streakData?.allStreaks ?? []);
    if (pool.length === 0) return null;
    return pool.reduce((a, b) => (a.currentStreak >= b.currentStreak ? a : b));
  }, [streakData]);

  const sortedGameRows = useMemo(() => [...gameModels], [gameModels]);

  const toggle = (key: string) => {
    setExpandedKey(prev => (prev === key ? null : key));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="container py-6 max-w-lg mx-auto px-4 sm:max-w-2xl">
        <header className="mb-6">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Models</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                How the 18 engines rank — secondary to playing the numbers, but useful when you are curious.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Full charts and admin tools live on the{" "}
            <Link href="/leaderboard" className="text-primary underline underline-offset-2 hover:text-primary/90">
              classic Leaderboard
            </Link>
            .
          </p>
        </header>

        <GameContextHeader
          selectedGame={selectedGame}
          onGameChange={setSelectedGame}
          scheduleRows={scheduleRows}
          isLoading={scheduleLoading}
        />

        {/* Summary strip */}
        <section className="mt-5 space-y-3" aria-label="Model summary">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">At a glance</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <Card className="bg-secondary/30 border-border/50">
              <CardContent className="p-3 flex gap-2 items-start">
                <Trophy className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Top ranked (all games)</p>
                  {allLoading ? (
                    <Skeleton className="h-4 w-28 mt-1" />
                  ) : topGlobal ? (
                    <>
                      <p className="text-sm font-semibold truncate">{MODEL_DISPLAY_NAMES[topGlobal.modelName] || topGlobal.modelName}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        composite {topGlobal.compositeScore.toFixed(3)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No rankings yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-secondary/30 border-border/50">
              <CardContent className="p-3 flex gap-2 items-start">
                <Layers className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Ensemble weights ({FLORIDA_GAMES[selectedGame].name})</p>
                  {perfLoading ? (
                    <Skeleton className="h-4 w-24 mt-1" />
                  ) : consensusSummary ? (
                    <>
                      <p className="text-sm font-semibold tabular-nums">avg {consensusSummary.avg.toFixed(2)}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">spread {consensusSummary.spread.toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not enough evaluations for weights</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-secondary/30 border-border/50">
              <CardContent className="p-3 flex gap-2 items-start">
                <Flame className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Hot streaks (3+ hits)</p>
                  {bestRecent ? (
                    <>
                      <p className="text-sm font-semibold truncate">
                        {MODEL_DISPLAY_NAMES[bestRecent.modelName] || bestRecent.modelName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {FLORIDA_GAMES[bestRecent.gameType as GameType]?.name ?? bestRecent.gameType} · {bestRecent.currentStreak} in a row
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No active streaks</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Per-game leaderboard */}
        <section className="mt-8" aria-labelledby="game-board-heading">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 id="game-board-heading" className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Rankings for {FLORIDA_GAMES[selectedGame].name}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Ordered by average main-number hits on recorded evaluations for this game. Tap a row for details.
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
              ))}
            </div>
          ) : !hasGameData ? (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="py-10 text-center px-4">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/35" />
                <h3 className="text-sm font-semibold mb-1">No evaluations for this game yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  After draws are scored against predictions, per-game rankings appear here. We do not show placeholder scores.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sortedGameRows.map((row, i) => {
                const rank = i + 1;
                const globalRow = allModelMap.get(row.modelName);
                const composite = globalRow?.compositeScore ?? null;
                const perf = perfByModel.get(row.modelName);
                const isOpen = expandedKey === row.modelName;

                return (
                  <ModelLeaderboardRow
                    key={row.modelName}
                    rank={rank}
                    modelKey={row.modelName}
                    avgMainHits={row.avgMainHits}
                    evaluationCount={row.totalEvaluated}
                    compositeScore={composite}
                    showComposite={hasGlobalData && composite != null}
                    isExpanded={isOpen}
                    onToggle={() => toggle(row.modelName)}
                    detailSlot={
                      <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Best single draw (main)</p>
                            <p className="font-semibold tabular-nums">{row.maxMainHits}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg special hits</p>
                            <p className="font-semibold tabular-nums">{row.avgSpecialHits.toFixed(3)}</p>
                          </div>
                          {globalRow ? (
                            <>
                              <div>
                                <p className="text-muted-foreground">Hit rate (all games)</p>
                                <p className="font-semibold tabular-nums">{globalRow.hitRate.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Consistency</p>
                                <p className="font-semibold tabular-nums">{(globalRow.consistency * 100).toFixed(0)}%</p>
                              </div>
                            </>
                          ) : null}
                          {perf ? (
                            <div className="col-span-2">
                              <p className="text-muted-foreground">Evaluations (this game, DB)</p>
                              <p className="font-semibold tabular-nums">{Number(perf.totalPredictions)}</p>
                            </div>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Rankings use stored evaluations only. Composite scores need cross-game history — switch to the full leaderboard for trends and backfill options.
                        </p>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Global empty hint */}
        {!allLoading && !hasGlobalData && (
          <p className="text-xs text-center text-muted-foreground mt-8 px-2">
            Global model scores and composite rankings will populate once evaluations exist across games.
          </p>
        )}
      </div>
    </div>
  );
}
