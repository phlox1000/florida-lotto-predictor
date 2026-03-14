import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { GitCompareArrows, Trophy, Target, TrendingUp, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";

function HitBall({ number, isHit }: { number: number; isHit: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm tabular-nums transition-all ${
        isHit
          ? "bg-green-500/80 text-white shadow-[0_0_10px_rgba(34,197,94,0.5)]"
          : "bg-destructive/20 text-destructive-foreground/60 border border-destructive/30"
      }`}
    >
      {number}
    </span>
  );
}

function ActualBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

function ModelAccuracyRow({
  model,
  rank,
}: {
  model: { modelName: string; totalEvaluated: number; avgMainHits: number; avgSpecialHits: number; maxMainHits: number };
  rank: number;
}) {
  const isTop3 = rank <= 3;
  const medalColors = ["text-yellow-400", "text-gray-300", "text-amber-600"];
  const pctBar = Math.min((model.avgMainHits / 5) * 100, 100);

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${isTop3 ? "bg-primary/5 border border-primary/20" : "bg-secondary/20"}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isTop3 ? medalColors[rank - 1] + " bg-secondary" : "text-muted-foreground bg-secondary/50"}`}>
        {rank <= 3 ? <Trophy className="w-4 h-4" /> : `#${rank}`}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate">
            {model.modelName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-border tabular-nums">
              {model.totalEvaluated} evals
            </Badge>
            <span className="text-sm font-mono text-primary">{model.avgMainHits.toFixed(1)}</span>
          </div>
        </div>
        <Progress value={pctBar} className="h-1.5" />
      </div>
    </div>
  );
}

interface DrawDetailProps {
  drawId: number;
  mainNumbers: number[];
  specialNumbers: number[];
}

function DrawDetailPanel({ drawId, mainNumbers, specialNumbers }: DrawDetailProps) {
  const { data, isLoading } = trpc.compare.drawDetail.useQuery({ drawId });
  const mainSet = useMemo(() => new Set(mainNumbers), [mainNumbers]);
  const specialSet = useMemo(() => new Set(specialNumbers), [specialNumbers]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.modelResults.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No predictions were evaluated against this draw.</p>
        <p className="text-xs mt-1">Run predictions before a draw to see comparisons here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        {data.modelResults.length} model predictions evaluated against this draw
      </p>
      {data.modelResults.map((mr) => {
        const totalMain = mr.predictedMain.length || 1;
        const hitPct = Math.round((mr.mainHits / totalMain) * 100);
        return (
          <div key={mr.modelName} className="rounded-lg bg-secondary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {mr.modelName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <div className="flex items-center gap-2">
                <Badge
                  variant={mr.mainHits >= 3 ? "default" : "outline"}
                  className={mr.mainHits >= 3 ? "bg-green-600 text-white" : "border-border"}
                >
                  {mr.mainHits} hits
                </Badge>
                {mr.specialHits > 0 && (
                  <Badge className="bg-accent text-accent-foreground">+{mr.specialHits} special</Badge>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">{hitPct}%</span>
              </div>
            </div>
            {mr.predictedMain.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {mr.predictedMain.map((n, i) => (
                  <HitBall key={i} number={n} isHit={mainSet.has(n)} />
                ))}
                {mr.predictedSpecial.map((n, i) => (
                  <span
                    key={`s-${i}`}
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm tabular-nums ${
                      specialSet.has(n)
                        ? "bg-accent text-accent-foreground shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                        : "bg-accent/10 text-accent/40 border border-accent/20"
                    }`}
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Compare() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [expandedDraw, setExpandedDraw] = useState<number | null>(null);

  const { data, isLoading } = trpc.compare.results.useQuery({ gameType: selectedGame, limit: 20 });

  const gameOptions = useMemo(
    () => GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const sortedModels = useMemo(
    () => (data?.modelSummary || []).sort((a, b) => b.avgMainHits - a.avgMainHits),
    [data?.modelSummary]
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitCompareArrows className="w-6 h-6 text-primary" />
              Results vs Predictions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compare model predictions against actual draw results with hit/miss highlighting
            </p>
          </div>
          <Select value={selectedGame} onValueChange={(v) => { setSelectedGame(v as GameType); setExpandedDraw(null); }}>
            <SelectTrigger className="w-[180px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gameOptions.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Model Leaderboard */}
          <div className="lg:col-span-1">
            <Card className="bg-card border-border/50 sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Model Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedModels.length > 0 ? (
                  sortedModels.map((model, i) => (
                    <ModelAccuracyRow key={model.modelName} model={model} rank={i + 1} />
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No performance data yet.</p>
                    <p className="text-xs mt-1">Run predictions, then fetch draw results to see comparisons.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Draw-by-Draw Comparison */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              Draw Results
              {data?.comparisons && (
                <Badge variant="outline" className="text-xs border-border ml-2">
                  {data.comparisons.length} draws
                </Badge>
              )}
            </h2>

            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-24 bg-muted/20 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : data?.comparisons && data.comparisons.length > 0 ? (
              data.comparisons.map((draw) => {
                const isExpanded = expandedDraw === draw.drawId;
                return (
                  <Card
                    key={draw.drawId}
                    className={`bg-card border-border/50 transition-all cursor-pointer ${isExpanded ? "border-primary/40 glow-cyan-sm" : "hover:border-primary/20"}`}
                    onClick={() => setExpandedDraw(isExpanded ? null : draw.drawId)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-sm">
                            <span className="font-semibold text-foreground">
                              {new Date(draw.drawDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            {draw.drawTime && (
                              <span className="text-muted-foreground ml-2 text-xs capitalize">({draw.drawTime})</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {isExpanded ? "Hide details" : "Show model results"}
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground mr-1">Winning:</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {draw.mainNumbers.map((n, i) => (
                            <ActualBall key={i} number={n} />
                          ))}
                          {draw.specialNumbers.map((n, i) => (
                            <ActualBall key={`s-${i}`} number={n} variant="special" />
                          ))}
                        </div>
                      </div>

                      {isExpanded && (
                        <>
                          <Separator className="my-3" />
                          <DrawDetailPanel
                            drawId={draw.drawId}
                            mainNumbers={draw.mainNumbers}
                            specialNumbers={draw.specialNumbers}
                          />
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <GitCompareArrows className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No draw results found for this game.</p>
                <p className="text-xs mt-1">Fetch results from the Admin panel first.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
