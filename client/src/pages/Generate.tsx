import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getModelDisplayName } from "@shared/modelMetadata";
import {
  TicketDisplay,
  LottoBallRow,
  CashPopTile, CashPopGrid,
  InlineConfidence, PredictionCard,
} from "@/components/predictions";
import {
  Clock, Zap, Brain, DollarSign, Sparkles, Shuffle,
} from "lucide-react";

type GenerateMode = "quick" | "smart" | "budget";

// ─── Game Context Bar ─────────────────────────────────────────────────────────

function GameContextBar({
  selectedGame,
  onGameChange,
  countdown,
}: {
  selectedGame: GameType;
  onGameChange: (g: GameType) => void;
  countdown?: string | null;
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

// ─── Mode Selector ────────────────────────────────────────────────────────────

const MODES: { id: GenerateMode; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "quick", label: "Quick", icon: Shuffle, desc: "Random picks" },
  { id: "smart", label: "Smart", icon: Brain, desc: "AI model picks" },
  { id: "budget", label: "Budget", icon: DollarSign, desc: "Optimized set" },
];

function ModeSelector({ mode, onChange }: { mode: GenerateMode; onChange: (m: GenerateMode) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {MODES.map(m => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
              active
                ? "bg-primary/10 border-primary/50 shadow-[0_0_8px_oklch(0.75_0.18_195/0.15)]"
                : "bg-card border-border/50 hover:border-border"
            }`}
          >
            <m.icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
            <span className={`text-xs font-semibold ${active ? "text-primary" : "text-foreground"}`}>{m.label}</span>
            <span className="text-[10px] text-muted-foreground">{m.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Budget Controls ──────────────────────────────────────────────────────────

function BudgetControls({
  budget,
  onBudgetChange,
  ticketPrice,
}: {
  budget: number;
  onBudgetChange: (b: number) => void;
  ticketPrice: number;
}) {
  const maxTickets = Math.floor(budget / ticketPrice);
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget</span>
          <span className="text-sm font-bold font-tabular-nums text-accent">${budget}</span>
        </div>
        <Slider
          value={[budget]}
          onValueChange={([v]) => onBudgetChange(v)}
          min={ticketPrice}
          max={75}
          step={ticketPrice}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-tabular-nums">
          <span>${ticketPrice}</span>
          <span>{maxTickets} tickets max</span>
          <span>$75</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quick Pick Results ───────────────────────────────────────────────────────

function QuickPickResults({
  data,
  isSingleNumber,
}: {
  data: { picks: Array<{ mainNumbers: number[]; specialNumbers: number[] }>; gameName: string };
  isSingleNumber: boolean;
}) {
  if (isSingleNumber) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Quick Picks</h3>
          <Badge variant="outline" className="text-[10px]">{data.picks.length} picks</Badge>
        </div>
        <CashPopGrid>
          {data.picks.map((p, i) => (
            <div
              key={i}
              className="relative rounded-xl border border-border/50 bg-card overflow-hidden min-h-[100px]"
            >
              <div className="flex flex-col items-center justify-center pt-4 pb-3 px-3">
                <span className="text-3xl font-extrabold font-tabular-nums">{p.mainNumbers[0]}</span>
                <span className="text-[10px] text-muted-foreground mt-1.5">Quick Pick #{i + 1}</span>
              </div>
              <div className="h-1.5 w-full bg-orange-500/40" />
            </div>
          ))}
        </CashPopGrid>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Quick Picks</h3>
        <Badge variant="outline" className="text-[10px]">{data.picks.length} picks</Badge>
      </div>
      <div className="space-y-2">
        {data.picks.map((p, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 text-xs font-bold font-tabular-nums shrink-0">
              #{i + 1}
            </div>
            <LottoBallRow mainNumbers={p.mainNumbers} specialNumbers={p.specialNumbers} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Smart Results ────────────────────────────────────────────────────────────

function SmartResults({
  predictions,
  gameName,
  isSingleNumber,
}: {
  predictions: Array<{ modelName: string; mainNumbers: number[]; specialNumbers: number[]; confidenceScore: number; metadata: Record<string, unknown> }>;
  gameName: string;
  isSingleNumber: boolean;
}) {
  const valid = predictions.filter(p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data);
  const sorted = [...valid].sort((a, b) => b.confidenceScore - a.confidenceScore);
  const top = sorted.slice(0, 6);

  if (top.length === 0) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          No models produced results. Load more historical data to enable predictions.
        </CardContent>
      </Card>
    );
  }

  if (isSingleNumber) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Top Model Picks</h3>
          <Badge variant="outline" className="text-[10px]">{valid.length} models</Badge>
        </div>
        <CashPopGrid>
          {top.map(p => (
            <CashPopTile
              key={p.modelName}
              number={p.mainNumbers[0]}
              modelName={p.modelName}
              confidence={p.confidenceScore}
              isInsufficient={!!p.metadata?.insufficient_data}
            />
          ))}
        </CashPopGrid>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Top Model Picks</h3>
        <Badge variant="outline" className="text-[10px]">{valid.length} models</Badge>
      </div>
      <div className="space-y-2">
        {top.map(p => (
          <PredictionCard key={p.modelName} prediction={p} />
        ))}
      </div>
    </div>
  );
}

// ─── Generate Screen ──────────────────────────────────────────────────────────

export default function Generate() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [mode, setMode] = useState<GenerateMode>("smart");
  const [budget, setBudget] = useState(20);

  const cfg = FLORIDA_GAMES[selectedGame];
  const isSingleNumber = cfg.mainCount === 1;

  const { data: scheduleData } = trpc.schedule.next.useQuery(
    { gameType: selectedGame },
    { staleTime: 30000, refetchInterval: 60000 },
  );

  const quickPick = trpc.predictions.quickPick.useMutation();
  const smartPick = trpc.predictions.generate.useMutation();
  const budgetPick = trpc.tickets.generate.useMutation();

  const isPending = quickPick.isPending || smartPick.isPending || budgetPick.isPending;

  const handleGenerate = useCallback(() => {
    // Reset other mutations so only the active mode's result shows
    quickPick.reset();
    smartPick.reset();
    budgetPick.reset();

    switch (mode) {
      case "quick":
        quickPick.mutate({ gameType: selectedGame, count: isSingleNumber ? 6 : 5 });
        break;
      case "smart":
        smartPick.mutate({ gameType: selectedGame, sumRangeFilter: false });
        break;
      case "budget":
        budgetPick.mutate({ gameType: selectedGame, budget, maxTickets: 20 });
        break;
    }
  }, [mode, selectedGame, budget, isSingleNumber, quickPick, smartPick, budgetPick]);

  const handleGameChange = useCallback((g: GameType) => {
    setSelectedGame(g);
    quickPick.reset();
    smartPick.reset();
    budgetPick.reset();
    setBudget(20);
  }, [quickPick, smartPick, budgetPick]);

  const modeIcon = MODES.find(m => m.id === mode)!.icon;
  const ModeIcon = modeIcon;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-lg mx-auto py-4 px-4 space-y-4">

        {/* Game context */}
        <GameContextBar
          selectedGame={selectedGame}
          onGameChange={handleGameChange}
          countdown={scheduleData?.countdown}
        />

        {/* Mode toggle */}
        <ModeSelector mode={mode} onChange={setMode} />

        {/* Budget slider (budget mode only) */}
        {mode === "budget" && (
          <BudgetControls budget={budget} onBudgetChange={setBudget} ticketPrice={cfg.ticketPrice} />
        )}

        {/* Primary CTA */}
        <Button
          onClick={handleGenerate}
          disabled={isPending}
          className="w-full h-12 text-base font-semibold"
          size="lg"
        >
          {isPending ? (
            <>
              <Sparkles className="w-5 h-5 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <ModeIcon className="w-5 h-5 mr-2" />
              Generate Picks
            </>
          )}
        </Button>

        {/* Loading */}
        {isPending && (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}

        {/* Results */}
        {!isPending && quickPick.data && mode === "quick" && (
          <QuickPickResults data={quickPick.data} isSingleNumber={isSingleNumber} />
        )}

        {!isPending && smartPick.data && mode === "smart" && (
          <SmartResults
            predictions={smartPick.data.predictions}
            gameName={smartPick.data.gameName}
            isSingleNumber={isSingleNumber}
          />
        )}

        {!isPending && budgetPick.data && mode === "budget" && (
          <TicketDisplay
            tickets={budgetPick.data.tickets}
            totalCost={budgetPick.data.totalCost}
            budget={budget}
            gameName={budgetPick.data.gameName}
            ticketPrice={budgetPick.data.ticketPrice}
            isSingleNumber={isSingleNumber}
          />
        )}
      </div>
    </div>
  );
}
