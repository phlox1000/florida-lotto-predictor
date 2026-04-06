import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, type GameType, MODEL_NAMES } from "@shared/lottery";
import { Swords, Trophy, Crown, Minus, ArrowRight, BarChart3, Target, Zap, Shield } from "lucide-react";
import { useState, useMemo } from "react";

// Note: legacy DB rows may exist under "random" — display maps handle both keys
const MODEL_DISPLAY: Record<string, string> = {
  frequency_baseline: "Frequency Baseline", random: "Frequency Baseline",
  poisson_standard: "Poisson Standard", poisson_short: "Poisson Short-Window",
  poisson_long: "Poisson Long-Window", hot_cold_70: "Hot-Cold 70/30", hot_cold_50: "Hot-Cold 50/50",
  balanced_hot_cold: "Balanced Hot-Cold", gap_analysis: "Gap Analysis", cooccurrence: "Co-Occurrence",
  delta: "Delta Frequency", temporal_echo: "Temporal Echo", monte_carlo: "Monte Carlo",
  markov_chain: "Markov Chain", bayesian: "Bayesian Posterior", quantum_entanglement: "Quantum Entanglement",
  cdm: "CDM (Dirichlet)", chi_square: "Chi-Square Anomaly", ai_oracle: "AI Oracle Ensemble",
};

function StatCompare({ label, valueA, valueB, format = "number", higherBetter = true }: {
  label: string; valueA: number; valueB: number; format?: "number" | "percent" | "integer"; higherBetter?: boolean;
}) {
  const aWins = higherBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherBetter ? valueB > valueA : valueA > valueB;
  const fmt = (v: number) => format === "percent" ? `${(v * 100).toFixed(0)}%` : format === "integer" ? v.toString() : v.toFixed(3);
  return (
    <div className="grid grid-cols-3 items-center py-2 border-b border-border/20 last:border-0">
      <div className={`text-right font-mono text-sm ${aWins ? "text-cyan-400 font-bold" : "text-muted-foreground"}`}>
        {fmt(valueA)} {aWins && <span className="text-[10px]">✓</span>}
      </div>
      <div className="text-center text-xs text-muted-foreground font-medium">{label}</div>
      <div className={`text-left font-mono text-sm ${bWins ? "text-orange-400 font-bold" : "text-muted-foreground"}`}>
        {bWins && <span className="text-[10px]">✓</span>} {fmt(valueB)}
      </div>
    </div>
  );
}

export default function HeadToHead() {
  const [modelA, setModelA] = useState<string>("ai_oracle");
  const [modelB, setModelB] = useState<string>("bayesian");

  const { data, isLoading } = trpc.leaderboard.headToHead.useQuery(
    { modelA, modelB },
    { enabled: modelA !== modelB }
  );

  const modelOptions = useMemo(() =>
    MODEL_NAMES.map(m => ({ value: m, label: MODEL_DISPLAY[m] || m })),
    []
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="container py-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Swords className="w-6 h-6 text-purple-400" />
          </div>
          <h1 className="text-3xl font-bold">Head-to-Head</h1>
        </div>
        <p className="text-muted-foreground mb-8">Select two models and compare their performance across all games.</p>

        {/* Model Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center mb-8">
          <div>
            <label className="text-xs text-cyan-400 font-medium mb-1 block">Model A</label>
            <Select value={modelA} onValueChange={setModelA}>
              <SelectTrigger className="bg-card border-cyan-500/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map(m => (
                  <SelectItem key={m.value} value={m.value} disabled={m.value === modelB}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-center pt-5">
            <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
              <Swords className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          <div>
            <label className="text-xs text-orange-400 font-medium mb-1 block">Model B</label>
            <Select value={modelB} onValueChange={setModelB}>
              <SelectTrigger className="bg-card border-orange-500/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map(m => (
                  <SelectItem key={m.value} value={m.value} disabled={m.value === modelA}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {modelA === modelB && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Please select two different models to compare.</p>
          </div>
        )}

        {isLoading && modelA !== modelB && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        )}

        {data && data.summary && (
          <>
            {/* Overall Winner Banner */}
            <Card className={`mb-6 ${
              data.summary.overallWinner === "a" ? "bg-gradient-to-r from-cyan-500/10 to-transparent border-cyan-500/30" :
              data.summary.overallWinner === "b" ? "bg-gradient-to-r from-transparent to-orange-500/10 border-orange-500/30" :
              "bg-muted/10 border-border/50"
            }`}>
              <CardContent className="p-6">
                <div className="grid grid-cols-3 items-center">
                  <div className="text-center">
                    <p className={`text-lg font-bold ${data.summary.overallWinner === "a" ? "text-cyan-400" : "text-muted-foreground"}`}>
                      {MODEL_DISPLAY[data.modelA] || data.modelA}
                    </p>
                    <p className="text-2xl font-bold text-cyan-400 mt-1">{data.summary.aOverallAvg.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">avg hits · {data.summary.aTotal} evals</p>
                  </div>
                  <div className="text-center">
                    {data.summary.overallWinner === "tie" ? (
                      <div className="flex flex-col items-center">
                        <Minus className="w-8 h-8 text-muted-foreground mb-1" />
                        <span className="text-sm font-medium text-muted-foreground">TIE</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Crown className="w-8 h-8 text-yellow-400 mb-1" />
                        <span className="text-sm font-medium text-yellow-400">WINNER</span>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Badge className="bg-cyan-500/20 text-cyan-400">{data.summary.aWins}W</Badge>
                      <Badge className="bg-muted/30 text-muted-foreground">{data.summary.ties}T</Badge>
                      <Badge className="bg-orange-500/20 text-orange-400">{data.summary.bWins}W</Badge>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${data.summary.overallWinner === "b" ? "text-orange-400" : "text-muted-foreground"}`}>
                      {MODEL_DISPLAY[data.modelB] || data.modelB}
                    </p>
                    <p className="text-2xl font-bold text-orange-400 mt-1">{data.summary.bOverallAvg.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">avg hits · {data.summary.bTotal} evals</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Per-Game Breakdown */}
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Per-Game Breakdown
            </h2>

            {data.games.length === 0 ? (
              <Card className="bg-card border-border/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No evaluation data available for these models yet.</p>
                  <p className="text-xs mt-1">Run predictions and backfill evaluations from the Leaderboard page first.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {data.games.map(game => (
                  <Card key={game.gameType} className={`bg-card transition-all ${
                    game.winner === "a" ? "border-cyan-500/30" : game.winner === "b" ? "border-orange-500/30" : "border-border/50"
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{game.gameName}</span>
                          {game.winner !== "tie" && (
                            <Badge className={`text-[10px] ${game.winner === "a" ? "bg-cyan-500/20 text-cyan-400" : "bg-orange-500/20 text-orange-400"}`}>
                              <Trophy className="w-2.5 h-2.5 mr-0.5" />
                              {game.winner === "a" ? MODEL_DISPLAY[data.modelA] : MODEL_DISPLAY[data.modelB]} wins
                            </Badge>
                          )}
                          {game.winner === "tie" && (
                            <Badge className="text-[10px] bg-muted/30 text-muted-foreground">Tie</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 items-center mb-2">
                        <div className="text-right text-xs font-medium text-cyan-400">{MODEL_DISPLAY[data.modelA]?.split(" ")[0]}</div>
                        <div className="text-center text-[10px] text-muted-foreground">VS</div>
                        <div className="text-left text-xs font-medium text-orange-400">{MODEL_DISPLAY[data.modelB]?.split(" ")[0]}</div>
                      </div>

                      <StatCompare label="Avg Hits" valueA={game.modelA.avgMainHits} valueB={game.modelB.avgMainHits} />
                      <StatCompare label="Best Match" valueA={game.modelA.maxMainHits} valueB={game.modelB.maxMainHits} format="integer" />
                      <StatCompare label="Consistency" valueA={game.modelA.consistency} valueB={game.modelB.consistency} format="percent" />
                      <StatCompare label="4+ Matches" valueA={game.modelA.perfectMatches} valueB={game.modelB.perfectMatches} format="integer" />
                      <StatCompare label="Evaluations" valueA={game.modelA.total} valueB={game.modelB.total} format="integer" higherBetter={false} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
