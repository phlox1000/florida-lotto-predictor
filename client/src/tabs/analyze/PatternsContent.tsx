/**
 * PatternsContent — the patterns sub-tab within AnalyzeTab.
 *
 * Reads selectedGame from GameContext.
 * Delegates all rendering to the existing Patterns page internals.
 * Removes the page-level header and game selector (those live in the shell).
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3, Flame, Snowflake, Clock, Link2, TrendingUp, TrendingDown,
  AlertTriangle, Grid3X3,
} from "lucide-react";
import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { LoadingState, EmptyState, ErrorState } from "@/components/StateViews";

const LOOKBACKS = [
  { value: "30", label: "Last 30 draws" },
  { value: "50", label: "Last 50 draws" },
  { value: "100", label: "Last 100 draws" },
  { value: "200", label: "Last 200 draws" },
  { value: "500", label: "Last 500 draws" },
];

// ─── FrequencyChart (inline, unchanged from Patterns.tsx) ────────────────────

function FrequencyChart({
  data,
  drawCount,
  isSpecial = false,
}: {
  data: Array<{ number: number; count: number; percentage: number }>;
  drawCount: number;
  isSpecial?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((item) => (
        <div key={item.number} className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              isSpecial
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-primary/20 text-primary"
            }`}
          >
            {item.number}
          </span>
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isSpecial ? "bg-yellow-500" : "bg-primary"
              }`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
            {item.count}×
          </span>
          <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
            {item.percentage.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PatternsContent() {
  const { selectedGame } = useGame();
  const [lookback, setLookback] = useState("100");

  const { data, isLoading, error } = trpc.patterns.analyze.useQuery(
    { gameType: selectedGame as any, lookback: parseInt(lookback) },
    { enabled: !!selectedGame }
  );

  return (
    <div className="space-y-4 pb-4">
      {/* Lookback selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Historical pattern analysis</p>
        <Select value={lookback} onValueChange={setLookback}>
          <SelectTrigger className="w-[160px] border-border/50 bg-card h-8 text-xs">
            <SelectValue placeholder="Lookback" />
          </SelectTrigger>
          <SelectContent>
            {LOOKBACKS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* States */}
      {isLoading && <LoadingState rows={4} />}

      {error && (
        <ErrorState message="Failed to load pattern data." />
      )}

      {data && data.drawCount === 0 && (
        <Card className="border-yellow-500/30">
          <CardContent className="p-6 flex items-center gap-3 text-yellow-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            No draw data available for this game. Go to Admin to fetch historical results first.
          </CardContent>
        </Card>
      )}

      {data && data.drawCount > 0 && (
        <Tabs defaultValue="frequency" className="space-y-4">
          <TabsList className="bg-secondary w-full grid grid-cols-5">
            <TabsTrigger value="frequency" className="text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="streaks" className="text-xs">
              <Flame className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs">
              <Clock className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="pairs" className="text-xs">
              <Link2 className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="text-xs">
              <Grid3X3 className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>

          {/* Frequency */}
          <TabsContent value="frequency" className="space-y-4">
            <Card className="border-cyan-500/20 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Number Frequency</CardTitle>
                <CardDescription>
                  How often each number appeared in the last {lookback} draws
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FrequencyChart data={data.frequency} drawCount={data.drawCount} />
              </CardContent>
            </Card>
            {data.specialFrequency && data.specialFrequency.length > 0 && (
              <Card className="border-yellow-500/20 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base text-yellow-400">
                    Special Number Frequency
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FrequencyChart
                    data={data.specialFrequency}
                    drawCount={data.drawCount}
                    isSpecial
                  />
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-green-500/20 bg-card/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-400" /> Top 10 Hot
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {data.frequency.slice(0, 10).map((f) => (
                      <Tooltip key={f.number}>
                        <TooltipTrigger>
                          <div className="lotto-ball lotto-ball-hot">{f.number}</div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {f.count} times ({f.percentage.toFixed(1)}%)
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-500/20 bg-card/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-blue-400" /> Top 10 Cold
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {[...data.frequency]
                      .reverse()
                      .slice(0, 10)
                      .map((f) => (
                        <Tooltip key={f.number}>
                          <TooltipTrigger>
                            <div className="lotto-ball lotto-ball-cold">{f.number}</div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {f.count} times ({f.percentage.toFixed(1)}%)
                          </TooltipContent>
                        </Tooltip>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Streaks */}
          <TabsContent value="streaks" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-red-500/20 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Flame className="h-5 w-5 text-red-400" /> Hottest Streaks
                  </CardTitle>
                  <CardDescription>Numbers on the longest hot streak</CardDescription>
                </CardHeader>
                <CardContent>
                  {(data.streaks?.filter((s: any) => s.streakType === "hot") ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {data.streaks
                        .filter((s: any) => s.streakType === "hot")
                        .slice(0, 10)
                        .map((s: any) => (
                          <div key={s.number} className="flex items-center gap-3">
                            <span className="lotto-ball lotto-ball-hot">{s.number}</span>
                            <div className="flex-1">
                              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-red-500 rounded-full"
                                  style={{
                                    width: `${Math.min((s.currentStreak / 10) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                              {s.currentStreak} in a row
                            </Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState title="No hot streaks" description="No numbers on a hot streak in this window" />
                  )}
                </CardContent>
              </Card>
              <Card className="border-blue-500/20 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Snowflake className="h-5 w-5 text-blue-400" /> Coldest Streaks
                  </CardTitle>
                  <CardDescription>Numbers on the longest cold streak</CardDescription>
                </CardHeader>
                <CardContent>
                  {(data.streaks?.filter((s: any) => s.streakType === "cold") ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {data.streaks
                        .filter((s: any) => s.streakType === "cold")
                        .slice(0, 10)
                        .map((s: any) => (
                          <div key={s.number} className="flex items-center gap-3">
                            <span className="lotto-ball lotto-ball-cold">{s.number}</span>
                            <div className="flex-1">
                              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{
                                    width: `${Math.min((s.currentStreak / 20) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">
                              {s.currentStreak} missed
                            </Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState title="No cold streaks" description="No numbers on a cold streak in this window" />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Overdue */}
          <TabsContent value="overdue" className="space-y-4">
            <Card className="border-orange-500/20 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-400" /> Overdue Numbers
                </CardTitle>
                <CardDescription>
                  Numbers that haven't appeared recently relative to their expected frequency
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.overdue?.length ? (
                  <div className="space-y-2">
                    {data.overdue.slice(0, 15).map((o: any) => (
                      <div key={o.number} className="flex items-center gap-3">
                        <span className="lotto-ball lotto-ball-main">{o.number}</span>
                        <div className="flex-1 text-xs">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-muted-foreground">
                              Last seen: draw #{o.lastSeen}
                            </span>
                            <span className="text-orange-400 font-medium tabular-nums">
                              {o.drawsSince} draws ago
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full"
                              style={{
                                width: `${Math.min((o.overdueScore / 3) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No overdue numbers" description="All numbers are appearing within expected frequency" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pairs */}
          <TabsContent value="pairs" className="space-y-4">
            <Card className="border-purple-500/20 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-purple-400" /> Top Co-occurring Pairs
                </CardTitle>
                <CardDescription>Numbers that appear together most frequently</CardDescription>
              </CardHeader>
              <CardContent>
                {data.pairs?.length ? (
                  <div className="space-y-2">
                    {data.pairs.slice(0, 15).map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5 tabular-nums">
                          {i + 1}.
                        </span>
                        <span className="lotto-ball lotto-ball-main">{p.a}</span>
                        <span className="text-xs text-muted-foreground">+</span>
                        <span className="lotto-ball lotto-ball-main">{p.b}</span>
                        <div className="flex-1">
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{
                                width: `${Math.min((p.count / (data.pairs[0]?.count || 1)) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        <Badge className="bg-purple-500/20 text-purple-400 text-[10px] tabular-nums">
                          {p.count}×
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No pair data" description="Not enough draw history to compute pairs" />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Heatmap */}
          <TabsContent value="heatmap" className="space-y-4">
            <Card className="border-cyan-500/20 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Grid3X3 className="h-5 w-5 text-cyan-400" /> Number Heatmap
                </CardTitle>
                <CardDescription>
                  Color intensity = relative frequency. Darker = more frequent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.frequency?.length ? (
                  <HeatmapGrid data={data.frequency} />
                ) : (
                  <EmptyState title="No heatmap data" />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── HeatmapGrid ─────────────────────────────────────────────────────────────

function HeatmapGrid({
  data,
}: {
  data: Array<{ number: number; count: number; percentage: number }>;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const sorted = [...data].sort((a, b) => a.number - b.number);

  return (
    <div className="grid grid-cols-10 gap-1">
      {sorted.map((item) => {
        const intensity = item.count / max;
        const bg = `rgba(6, 182, 212, ${0.1 + intensity * 0.7})`; // cyan with variable opacity
        return (
          <Tooltip key={item.number}>
            <TooltipTrigger asChild>
              <div
                className="aspect-square rounded-md flex items-center justify-center text-xs font-bold cursor-default transition-all hover:scale-110"
                style={{ backgroundColor: bg, color: intensity > 0.5 ? "#fff" : "#94a3b8" }}
              >
                {item.number}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              #{item.number}: {item.count} times ({item.percentage.toFixed(1)}%)
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
