import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart3, Flame, Snowflake, Clock, Link2, TrendingUp, TrendingDown, AlertTriangle, Grid3X3 } from "lucide-react";

const GAMES = [
  { value: "fantasy_5", label: "Fantasy 5" },
  { value: "powerball", label: "Powerball" },
  { value: "mega_millions", label: "Mega Millions" },
  { value: "florida_lotto", label: "Florida Lotto" },
  { value: "cash4life", label: "Cash4Life" },
  { value: "pick_2", label: "Pick 2" },
  { value: "pick_3", label: "Pick 3" },
  { value: "pick_4", label: "Pick 4" },
  { value: "pick_5", label: "Pick 5" },
];

const LOOKBACKS = [
  { value: "30", label: "Last 30 draws" },
  { value: "50", label: "Last 50 draws" },
  { value: "100", label: "Last 100 draws" },
  { value: "200", label: "Last 200 draws" },
  { value: "500", label: "Last 500 draws" },
];

export default function Patterns() {
  const [gameType, setGameType] = useState("fantasy_5");
  const [lookback, setLookback] = useState("100");

  const { data, isLoading, error } = trpc.patterns.analyze.useQuery(
    { gameType: gameType as any, lookback: parseInt(lookback) },
    { enabled: !!gameType }
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-cyan-400" />
              Pattern Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Analyze number frequency, streaks, overdue numbers, and pair correlations
            </p>
          </div>
          <div className="flex gap-3">
            <Select value={gameType} onValueChange={setGameType}>
              <SelectTrigger className="w-[180px] border-cyan-500/30 bg-card">
                <SelectValue placeholder="Select game" />
              </SelectTrigger>
              <SelectContent>
                {GAMES.map(g => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lookback} onValueChange={setLookback}>
              <SelectTrigger className="w-[180px] border-cyan-500/30 bg-card">
                <SelectValue placeholder="Lookback" />
              </SelectTrigger>
              <SelectContent>
                {LOOKBACKS.map(l => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <Card className="border-red-500/30">
            <CardContent className="p-6 text-red-400">Failed to load pattern data.</CardContent>
          </Card>
        )}

        {data && data.drawCount === 0 && (
          <Card className="border-yellow-500/30">
            <CardContent className="p-6 flex items-center gap-3 text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              No draw data available for this game. Go to Admin to fetch historical results first.
            </CardContent>
          </Card>
        )}

        {data && data.drawCount > 0 && (
          <>
            <div className="text-sm text-muted-foreground">
              Analyzing <span className="text-cyan-400 font-semibold">{data.drawCount}</span> draws
            </div>

            <Tabs defaultValue="frequency" className="space-y-4">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="frequency" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <BarChart3 className="h-4 w-4 mr-2" /> Frequency
                </TabsTrigger>
                <TabsTrigger value="streaks" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Flame className="h-4 w-4 mr-2" /> Streaks
                </TabsTrigger>
                <TabsTrigger value="overdue" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Clock className="h-4 w-4 mr-2" /> Overdue
                </TabsTrigger>
                <TabsTrigger value="pairs" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Link2 className="h-4 w-4 mr-2" /> Pairs
                </TabsTrigger>
                <TabsTrigger value="heatmap" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Grid3X3 className="h-4 w-4 mr-2" /> Heatmap
                </TabsTrigger>
              </TabsList>

              {/* ─── Frequency Tab ─── */}
              <TabsContent value="frequency" className="space-y-4">
                <Card className="border-cyan-500/20 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-lg">Number Frequency Distribution</CardTitle>
                    <CardDescription>How often each number has appeared in the selected draws</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FrequencyChart data={data.frequency} drawCount={data.drawCount} />
                  </CardContent>
                </Card>
                {data.specialFrequency && data.specialFrequency.length > 0 && (
                  <Card className="border-yellow-500/20 bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-lg text-yellow-400">Special Number Frequency</CardTitle>
                      <CardDescription>Powerball / Mega Ball / Cash Ball frequency</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FrequencyChart data={data.specialFrequency} drawCount={data.drawCount} isSpecial />
                    </CardContent>
                  </Card>
                )}
                {/* Top 10 / Bottom 10 summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-green-500/20 bg-card/80">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-400" /> Top 10 Most Frequent
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {data.frequency.slice(0, 10).map(f => (
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
                        <TrendingDown className="h-4 w-4 text-blue-400" /> Top 10 Least Frequent
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {[...data.frequency].reverse().slice(0, 10).map(f => (
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

              {/* ─── Streaks Tab ─── */}
              <TabsContent value="streaks" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-red-500/20 bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Flame className="h-5 w-5 text-red-400" /> Hottest Streaks
                      </CardTitle>
                      <CardDescription>Numbers currently on the longest hot streak (appearing consecutively)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {data.streaks
                          .filter(s => s.streakType === "hot")
                          .slice(0, 15)
                          .map(s => (
                            <StreakRow key={s.number} streak={s} />
                          ))}
                        {data.streaks.filter(s => s.streakType === "hot").length === 0 && (
                          <p className="text-muted-foreground text-sm">No hot streaks detected</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-500/20 bg-card/80">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Snowflake className="h-5 w-5 text-blue-400" /> Coldest Streaks
                      </CardTitle>
                      <CardDescription>Numbers currently on the longest cold streak (not appearing)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {data.streaks
                          .filter(s => s.streakType === "cold")
                          .slice(0, 15)
                          .map(s => (
                            <StreakRow key={s.number} streak={s} />
                          ))}
                        {data.streaks.filter(s => s.streakType === "cold").length === 0 && (
                          <p className="text-muted-foreground text-sm">No cold streaks detected</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                {/* All numbers streak map */}
                <Card className="border-cyan-500/20 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-lg">Full Streak Map</CardTitle>
                    <CardDescription>Every number colored by current streak type and intensity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {data.streaks
                        .sort((a, b) => a.number - b.number)
                        .map(s => {
                          const intensity = Math.min(1, s.currentStreak / 10);
                          const bg = s.streakType === "hot"
                            ? `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`
                            : `rgba(59, 130, 246, ${0.2 + intensity * 0.6})`;
                          return (
                            <Tooltip key={s.number}>
                              <TooltipTrigger>
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border border-white/10"
                                  style={{ background: bg }}
                                >
                                  {s.number}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-1">
                                  <div>{s.streakType === "hot" ? "🔥 Hot" : "❄️ Cold"} streak: {s.currentStreak}</div>
                                  <div>Max hot: {s.maxHotStreak} | Max cold: {s.maxColdStreak}</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Overdue Tab ─── */}
              <TabsContent value="overdue" className="space-y-4">
                <Card className="border-yellow-500/20 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-400" /> Most Overdue Numbers
                    </CardTitle>
                    <CardDescription>Numbers that haven't appeared for the longest time — statistically "due"</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.overdue.slice(0, 20).map((o, i) => (
                        <div key={o.number} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                          <span className="text-muted-foreground text-xs w-6">#{i + 1}</span>
                          <div className="lotto-ball lotto-ball-overdue">{o.number}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-red-500"
                                style={{ width: `${Math.min(100, (o.drawsSinceLastAppearance / data.drawCount) * 100 * 3)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-yellow-400">
                              {o.drawsSinceLastAppearance} draws ago
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Avg gap: {o.averageGap.toFixed(1)}
                            </div>
                          </div>
                          {o.drawsSinceLastAppearance > o.averageGap * 1.5 && (
                            <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                              Overdue
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Heatmap Tab ─── */}
              <TabsContent value="heatmap" className="space-y-4">
                <HeatmapTab gameType={gameType} lookback={parseInt(lookback)} />
              </TabsContent>

              {/* ─── Pairs Tab ─── */}
              <TabsContent value="pairs" className="space-y-4">
                <Card className="border-purple-500/20 bg-card/80">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-purple-400" /> Top Number Pairs
                    </CardTitle>
                    <CardDescription>Numbers that most frequently appear together in the same draw</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {data.pairs.map((p, i) => (
                        <div key={`${p.numberA}-${p.numberB}`} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                          <span className="text-muted-foreground text-xs w-6">#{i + 1}</span>
                          <div className="flex items-center gap-1">
                            <div className="lotto-ball lotto-ball-pair">{p.numberA}</div>
                            <Link2 className="h-3 w-3 text-purple-400" />
                            <div className="lotto-ball lotto-ball-pair">{p.numberB}</div>
                          </div>
                          <div className="flex-1">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
                              style={{ width: `${Math.min(100, p.percentage * 5)}%` }}
                            />
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-purple-400">
                              {p.count} times
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.percentage.toFixed(1)}% of draws
                            </div>
                          </div>
                        </div>
                      ))}
                      {data.pairs.length === 0 && (
                        <p className="text-muted-foreground text-sm">Not enough data for pair analysis</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function FrequencyChart({ data, drawCount, isSpecial }: {
  data: Array<{ number: number; count: number; percentage: number }>;
  drawCount: number;
  isSpecial?: boolean;
}) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const sorted = [...data].sort((a, b) => a.number - b.number);
  const barColor = isSpecial ? "bg-yellow-500" : "bg-cyan-500";

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      <div className="flex items-end gap-[2px] h-40 overflow-x-auto pb-2">
        {sorted.map(d => {
          const height = (d.count / maxCount) * 100;
          return (
            <Tooltip key={d.number}>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center min-w-[20px]">
                  <div
                    className={`w-full ${barColor} rounded-t opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
                    style={{ height: `${Math.max(2, height)}%`, minHeight: "2px" }}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">{d.number}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-bold">Number {d.number}</div>
                  <div>{d.count} appearances ({d.percentage.toFixed(1)}%)</div>
                  <div>Expected: {(drawCount * (isSpecial ? 1 : 5) / sorted.length).toFixed(1)}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {/* Stats summary */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Most frequent: <strong className="text-foreground">{data[0]?.number}</strong> ({data[0]?.count}x)</span>
        <span>Least frequent: <strong className="text-foreground">{data[data.length - 1]?.number}</strong> ({data[data.length - 1]?.count}x)</span>
        <span>Avg: <strong className="text-foreground">{(data.reduce((s, d) => s + d.count, 0) / data.length).toFixed(1)}</strong></span>
      </div>
    </div>
  );
}

function StreakRow({ streak }: { streak: { number: number; currentStreak: number; streakType: "hot" | "cold"; maxHotStreak: number; maxColdStreak: number } }) {
  const isHot = streak.streakType === "hot";
  return (
    <div className="flex items-center gap-3 py-1">
      <div className={`lotto-ball ${isHot ? "lotto-ball-hot" : "lotto-ball-cold"}`}>
        {streak.number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {isHot ? <Flame className="h-3 w-3 text-red-400" /> : <Snowflake className="h-3 w-3 text-blue-400" />}
          <span className={`text-sm font-semibold ${isHot ? "text-red-400" : "text-blue-400"}`}>
            {streak.currentStreak} draw streak
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Record: {streak.maxHotStreak} hot / {streak.maxColdStreak} cold
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap Tab ─────────────────────────────────────────────────────────────

function HeatmapTab({ gameType, lookback }: { gameType: string; lookback: number }) {
  const { data, isLoading, error } = trpc.patterns.heatmap.useQuery(
    { gameType: gameType as any, lookback },
    { enabled: !!gameType }
  );

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
    </div>
  );

  if (error) return (
    <Card className="border-red-500/30">
      <CardContent className="p-6 text-red-400">Failed to load heatmap data.</CardContent>
    </Card>
  );

  if (!data || data.drawCount === 0) return (
    <Card className="border-yellow-500/30">
      <CardContent className="p-6 flex items-center gap-3 text-yellow-400">
        <AlertTriangle className="h-5 w-5" />
        No draw data available for the heatmap.
      </CardContent>
    </Card>
  );

  const { grid, dates, hotNumbers = [], dateCount = 0 } = data;

  // Color scale: 0 hits = dark, more hits = brighter cyan
  const maxHits = Math.max(...grid.map(g => g.totalHits), 1);

  return (
    <div className="space-y-6">
      {/* Hot Numbers Summary */}
      <Card className="border-cyan-500/20 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-cyan-400" /> Hottest Numbers (Last {dateCount} Draws)
          </CardTitle>
          <CardDescription>Numbers ranked by total appearances across the visible date range</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {hotNumbers.slice(0, 15).map((hn, i) => (
              <Tooltip key={hn.number}>
                <TooltipTrigger>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all"
                      style={{
                        borderColor: `oklch(0.75 0.18 ${180 - (i / 15) * 120})`,
                        background: `oklch(0.35 0.08 ${180 - (i / 15) * 120} / 0.3)`,
                        color: `oklch(0.9 0.12 ${180 - (i / 15) * 120})`,
                      }}
                    >
                      {hn.number}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{hn.totalHits}x</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <div className="font-bold">Number {hn.number}</div>
                    <div>{hn.totalHits} hits in {dateCount} draws</div>
                    <div>Max consecutive: {hn.maxConsecutive}</div>
                    <div>Hit rate: {((hn.totalHits / dateCount) * 100).toFixed(1)}%</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Calendar Heatmap Grid */}
      <Card className="border-cyan-500/20 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg">Number x Date Heatmap</CardTitle>
          <CardDescription>
            Each cell shows whether a number was drawn on a specific date. Brighter = drawn, dark = not drawn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Date headers */}
              <div className="flex">
                <div className="w-12 shrink-0" /> {/* spacer for number labels */}
                {dates.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 min-w-[18px] text-center"
                    title={d}
                  >
                    <span className="text-[8px] text-muted-foreground/60 writing-mode-vertical" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", display: "inline-block", height: "60px", lineHeight: "18px" }}>
                      {d}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid rows */}
              {grid.map(row => (
                <div key={row.number} className="flex items-center group">
                  <div className="w-12 shrink-0 text-right pr-2 text-xs text-muted-foreground font-mono group-hover:text-cyan-400 transition-colors">
                    {row.number}
                  </div>
                  {row.hits.map((hit, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div
                          className="flex-1 min-w-[18px] aspect-square m-[1px] rounded-sm cursor-pointer transition-all hover:scale-125 hover:z-10"
                          style={{
                            background: hit
                              ? `oklch(0.7 0.15 180 / ${0.5 + (row.totalHits / maxHits) * 0.5})`
                              : "oklch(0.2 0.01 240 / 0.3)",
                            boxShadow: hit ? "0 0 4px oklch(0.7 0.15 180 / 0.3)" : "none",
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-bold">Number {row.number} — {dates[i]}</div>
                          <div>{hit ? "\u2705 Drawn" : "\u274c Not drawn"}</div>
                          <div>Total hits: {row.totalHits}/{dateCount}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  <div className="w-10 shrink-0 text-left pl-2 text-[10px] text-muted-foreground">
                    {row.totalHits}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/30">
                <span className="text-xs text-muted-foreground">Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-sm" style={{ background: "oklch(0.2 0.01 240 / 0.3)" }} />
                  <span className="text-xs text-muted-foreground">Not drawn</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-sm" style={{ background: "oklch(0.7 0.15 180 / 0.5)" }} />
                  <span className="text-xs text-muted-foreground">Drawn (low freq)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-sm" style={{ background: "oklch(0.7 0.15 180 / 1.0)", boxShadow: "0 0 4px oklch(0.7 0.15 180 / 0.3)" }} />
                  <span className="text-xs text-muted-foreground">Drawn (high freq)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
