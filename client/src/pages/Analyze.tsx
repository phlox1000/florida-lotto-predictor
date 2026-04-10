import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getModelDisplayName } from "@shared/modelMetadata";
import {
  SmartRecommendationPanel,
  LottoBall, LottoBallRow,
  CashPopTile, CashPopGrid,
  InlineConfidence,
} from "@/components/predictions";
import {
  Clock, Flame, Snowflake, ChevronRight, Zap, Trophy,
  ArrowRight, BarChart3,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Game Context Bar ─────────────────────────────────────────────────────────

function GameContextBar({
  selectedGame,
  onGameChange,
  countdown,
  nextDraw,
}: {
  selectedGame: GameType;
  onGameChange: (g: GameType) => void;
  countdown?: string | null;
  nextDraw?: string | null;
}) {
  const cfg = FLORIDA_GAMES[selectedGame];
  const activeGames = useMemo(
    () => GAME_TYPES.filter(g => !FLORIDA_GAMES[g].schedule.ended),
    [],
  );

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border/50">
      <div className="flex items-center gap-3 min-w-0">
        <Select value={selectedGame} onValueChange={v => onGameChange(v as GameType)}>
          <SelectTrigger className="w-[160px] bg-secondary/50 border-border/30 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeGames.map(g => (
              <SelectItem key={g} value={g}>{FLORIDA_GAMES[g].name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cfg.mainCount === 1 && (
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">1-of-{cfg.mainMax}</Badge>
        )}
      </div>
      {countdown && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-tabular-nums">{countdown}</span>
        </div>
      )}
    </div>
  );
}

// ─── Last Draw Section ────────────────────────────────────────────────────────

function LastDrawSection({ gameType }: { gameType: GameType }) {
  const { data, isLoading } = trpc.draws.byGame.useQuery(
    { gameType, limit: 1 },
    { staleTime: 60000 },
  );

  if (isLoading) return <Skeleton className="h-20" />;
  if (!data || data.length === 0) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <Trophy className="w-6 h-6 mx-auto mb-1 opacity-30" />
          No draw results yet for this game.
        </CardContent>
      </Card>
    );
  }

  const draw = data[0];
  const mainNums = draw.mainNumbers as number[];
  const specialNums = (draw.specialNumbers as number[]) || [];
  const cfg = FLORIDA_GAMES[gameType];
  const isSingle = cfg.mainCount === 1;

  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last Draw</h3>
          <span className="text-xs text-muted-foreground font-tabular-nums">
            {new Date(draw.drawDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {draw.drawTime && draw.drawTime !== "evening" && ` · ${draw.drawTime}`}
          </span>
        </div>
        {isSingle ? (
          <div className="flex items-center gap-3">
            <span className="lotto-ball lotto-ball-main lotto-ball-single">{mainNums[0]}</span>
            <span className="text-sm text-muted-foreground">Winning number</span>
          </div>
        ) : (
          <LottoBallRow mainNumbers={mainNums} specialNumbers={specialNums} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Hot/Cold Insight Section ─────────────────────────────────────────────────

function HotColdInsight({ gameType }: { gameType: GameType }) {
  const cfg = FLORIDA_GAMES[gameType];
  const { data, isLoading } = trpc.patterns.analyze.useQuery(
    { gameType, lookback: 50 },
    { staleTime: 120000 },
  );

  if (isLoading) return <Skeleton className="h-28" />;
  if (!data || data.drawCount === 0) return null;

  const hot = data.streaks
    .filter(s => s.streakType === "hot")
    .slice(0, 5);
  const cold = data.streaks
    .filter(s => s.streakType === "cold")
    .slice(0, 5);

  if (hot.length === 0 && cold.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Hot */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-400">Hot Numbers</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {hot.map(s => (
              <span key={s.number} className="lotto-ball lotto-ball-hot w-8 h-8 text-xs">{s.number}</span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {hot.length > 0 ? `${hot[0].currentStreak} draws in a row` : ""}
          </p>
        </CardContent>
      </Card>

      {/* Cold */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Snowflake className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400">Cold Numbers</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {cold.map(s => (
              <span key={s.number} className="lotto-ball lotto-ball-cold w-8 h-8 text-xs">{s.number}</span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {cold.length > 0 ? `${cold[0].currentStreak} draws absent` : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Smart Hero Section ───────────────────────────────────────────────────────

function SmartHero({
  gameType,
  isSingleNumber,
}: {
  gameType: GameType;
  isSingleNumber: boolean;
}) {
  const generatePredictions = trpc.predictions.generate.useMutation();
  const predictions = generatePredictions.data?.predictions;
  const [autoRan, setAutoRan] = useState(false);

  useEffect(() => {
    if (!autoRan) {
      generatePredictions.mutate({ gameType, sumRangeFilter: false });
      setAutoRan(true);
    }
  }, [gameType]);

  // Reset auto-run when game changes
  useEffect(() => { setAutoRan(false); }, [gameType]);

  if (generatePredictions.isPending) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            {Array.from({ length: isSingleNumber ? 3 : 5 }).map((_, i) => (
              <Skeleton key={i} className="w-10 h-10 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!predictions || predictions.length === 0) {
    return (
      <Card className="border-border/30 bg-card/60">
        <CardContent className="p-5 text-center">
          <Zap className="w-8 h-8 mx-auto mb-2 text-primary/30" />
          <p className="text-sm text-muted-foreground">Run models to see Smart Picks</p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => generatePredictions.mutate({ gameType, sumRangeFilter: false })}
          >
            <Zap className="w-4 h-4 mr-1" />
            Generate Predictions
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Cash Pop: show dedicated tile grid for top models
  if (isSingleNumber) {
    const valid = predictions.filter(p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data);
    const sorted = [...valid].sort((a, b) => b.confidenceScore - a.confidenceScore);
    const top = sorted.slice(0, 6);

    return (
      <div className="space-y-3">
        <SmartRecommendationPanel predictions={predictions} topN={3} isSingleNumber />
        <CashPopGrid>
          {top.map(p => (
            <CashPopTile
              key={p.modelName}
              number={p.mainNumbers[0]}
              modelName={p.modelName}
              confidence={p.confidenceScore}
            />
          ))}
        </CashPopGrid>
      </div>
    );
  }

  return <SmartRecommendationPanel predictions={predictions} />;
}

// ─── Analyze Screen ───────────────────────────────────────────────────────────

export default function Analyze() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [, navigate] = useLocation();

  const cfg = FLORIDA_GAMES[selectedGame];
  const isSingleNumber = cfg.mainCount === 1;

  const { data: scheduleData } = trpc.schedule.next.useQuery(
    { gameType: selectedGame },
    { staleTime: 30000, refetchInterval: 60000 },
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-lg mx-auto py-4 px-4 space-y-4">

        {/* Game context */}
        <GameContextBar
          selectedGame={selectedGame}
          onGameChange={setSelectedGame}
          countdown={scheduleData?.countdown}
          nextDraw={scheduleData?.nextDraw}
        />

        {/* Smart Recommendation hero */}
        <SmartHero gameType={selectedGame} isSingleNumber={isSingleNumber} />

        {/* Last draw */}
        <LastDrawSection gameType={selectedGame} />

        {/* Hot / Cold insight */}
        <HotColdInsight gameType={selectedGame} />

        {/* Drill-down actions */}
        <div className="space-y-2">
          <button
            onClick={() => navigate("/predictions")}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">View All 18 Models</p>
                <p className="text-[10px] text-muted-foreground">Individual model predictions & details</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          <button
            onClick={() => navigate("/patterns")}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-accent" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Deep Pattern Analysis</p>
                <p className="text-[10px] text-muted-foreground">Frequency, heatmap, pairs & streaks</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
