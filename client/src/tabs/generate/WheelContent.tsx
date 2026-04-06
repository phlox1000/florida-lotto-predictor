/**
 * WheelContent — the Number Wheel sub-tab within GenerateTab.
 *
 * Reads selectedGame from GameContext (no local game state).
 * All wheel logic is identical to the original Wheel page,
 * but the Navbar and game selector are removed.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { Cog, Ticket, DollarSign, Target, Percent, Trash2, Plus, Info, AlertCircle, Sparkles, Brain } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useGame } from "@/contexts/GameContext";
import { EmptyState } from "@/components/StateViews";

// ─── NumberSelector (unchanged from Wheel.tsx) ───────────────────────────────

function NumberSelector({
  max,
  selected,
  onToggle,
  keyNumber,
  onKeyToggle,
  showKey,
}: {
  max: number;
  selected: Set<number>;
  onToggle: (n: number) => void;
  keyNumber: number | null;
  onKeyToggle: (n: number) => void;
  showKey: boolean;
}) {
  const numbers = Array.from({ length: max }, (_, i) => i + 1);
  const cols =
    max <= 12
      ? "grid-cols-6"
      : max <= 36
      ? "grid-cols-9"
      : max <= 53
      ? "grid-cols-10"
      : "grid-cols-10";
  return (
    <div className={`grid ${cols} gap-1.5`}>
      {numbers.map((n) => {
        const isSelected = selected.has(n);
        const isKey = keyNumber === n;
        return (
          <button
            key={n}
            onClick={() => onToggle(n)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (showKey && isSelected) onKeyToggle(n);
            }}
            className={`
              w-full aspect-square rounded-lg text-sm font-bold transition-all
              flex items-center justify-center relative
              ${
                isKey
                  ? "bg-yellow-400 text-black ring-2 ring-yellow-400/50 scale-110"
                  : isSelected
                  ? "bg-primary text-primary-foreground ring-1 ring-primary/50"
                  : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }
            `}
          >
            {n}
            {isKey && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-600 flex items-center justify-center text-[8px] text-white">
                K
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── TicketCard (unchanged from Wheel.tsx) ───────────────────────────────────

function TicketCard({
  ticket,
  gameConfig,
  index,
}: {
  ticket: { mainNumbers: number[]; ticketNumber: number };
  gameConfig: (typeof FLORIDA_GAMES)[GameType];
  index: number;
}) {
  return (
    <div className="flex items-center gap-3 bg-muted/10 rounded-lg px-3 py-2">
      <span className="text-xs text-muted-foreground w-8 flex-shrink-0 tabular-nums">
        #{ticket.ticketNumber}
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {ticket.mainNumbers.map((n, i) => (
          <span
            key={i}
            className="w-8 h-8 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center tabular-nums"
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WheelContent() {
  const { selectedGame } = useGame();
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [wheelType, setWheelType] = useState<"full" | "abbreviated" | "key">("abbreviated");
  const [keyNumber, setKeyNumber] = useState<number | null>(null);
  const [maxTickets, setMaxTickets] = useState(50);
  const [smartCount, setSmartCount] = useState(8);

  const cfg = FLORIDA_GAMES[selectedGame];
  const isDigitGame = cfg.isDigitGame;

  const generateMutation = trpc.wheel.generate.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const smartMutation = trpc.wheel.smartNumbers.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.numbers.length === 0) {
        toast.error("No consensus numbers found. Ensure historical data is loaded.");
        return;
      }
      setSelectedNumbers(new Set(data.numbers));
      setKeyNumber(null);
      toast.success(
        `Smart Wheel loaded ${data.numbers.length} consensus numbers from ${data.totalModelsUsed} models`
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleNumber = (n: number) => {
    setSelectedNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
        if (keyNumber === n) setKeyNumber(null);
      } else {
        if (next.size >= 20) {
          toast.error("Maximum 20 numbers allowed");
          return prev;
        }
        next.add(n);
      }
      return next;
    });
  };

  const toggleKey = (n: number) => {
    setKeyNumber((prev) => (prev === n ? null : n));
  };

  const clearAll = () => {
    setSelectedNumbers(new Set());
    setKeyNumber(null);
  };

  const handleGenerate = () => {
    if (selectedNumbers.size < cfg.mainCount) {
      toast.error(`Select at least ${cfg.mainCount} numbers for ${cfg.name}`);
      return;
    }
    if (wheelType === "key" && !keyNumber) {
      toast.error("Select a key number first (right-click a selected number)");
      return;
    }
    generateMutation.mutate({
      gameType: selectedGame,
      selectedNumbers: [...selectedNumbers],
      wheelType,
      keyNumber: keyNumber ?? undefined,
      maxTickets,
    });
  };

  const result = generateMutation.data;

  if (isDigitGame) {
    return (
      <EmptyState
        icon={<AlertCircle className="w-12 h-12" />}
        title="Wheel not available for digit games"
        description="The Number Wheel is designed for multi-number lottery games. Switch to Fantasy 5, Powerball, or another multi-ball game."
      />
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Configuration card */}
      <Card className="bg-card border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Wheel Type</Label>
              <Select
                value={wheelType}
                onValueChange={(v) => setWheelType(v as typeof wheelType)}
              >
                <SelectTrigger className="bg-background h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Wheel</SelectItem>
                  <SelectItem value="abbreviated">Abbreviated</SelectItem>
                  <SelectItem value="key">Key Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Max Tickets</Label>
              <Select
                value={String(maxTickets)}
                onValueChange={(v) => setMaxTickets(Number(v))}
              >
                <SelectTrigger className="bg-background h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} tickets
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Wheel type info */}
          <div className="bg-muted/10 rounded-lg p-3 text-xs text-muted-foreground flex gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {wheelType === "full" && (
                <span>
                  <strong className="text-foreground">Full Wheel:</strong> Every possible
                  combination. Guarantees a jackpot if all winning numbers are in your pool.
                </span>
              )}
              {wheelType === "abbreviated" && (
                <span>
                  <strong className="text-foreground">Abbreviated Wheel:</strong> Balanced
                  coverage with fewer tickets. Best balance of cost vs. coverage.
                </span>
              )}
              {wheelType === "key" && (
                <span>
                  <strong className="text-foreground">Key Number Wheel:</strong> One "key"
                  number appears in every ticket. Right-click a selected number to set it as
                  key.
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Wheel */}
      <Card className="bg-card border-primary/30 glow-cyan-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Smart Wheel</span>
            <Badge className="bg-primary/20 text-primary text-[10px]">AI-Powered</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Auto-select the top consensus numbers from all 18 prediction models, weighted by
            each model's confidence score.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">How many numbers</Label>
              <Select
                value={String(smartCount)}
                onValueChange={(v) => setSmartCount(Number(v))}
              >
                <SelectTrigger className="bg-background h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 7, 8, 9, 10, 12, 15].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} numbers
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">&nbsp;</Label>
              <Button
                onClick={() =>
                  smartMutation.mutate({ gameType: selectedGame, count: smartCount })
                }
                disabled={smartMutation.isPending}
                className="w-full h-9 bg-gradient-to-r from-primary to-cyan-400 hover:from-primary/90 hover:to-cyan-400/90 text-black font-semibold text-xs"
              >
                {smartMutation.isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    Analyzing…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    Smart Fill
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Smart results detail */}
          {smartMutation.data && !smartMutation.data.error && smartMutation.data.numbers.length > 0 && (
            <div className="bg-muted/10 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {smartMutation.data.totalModelsUsed}/{smartMutation.data.totalModels} models
                  used &bull; {smartMutation.data.historyUsed} draws analyzed
                </span>
              </div>
              <div className="space-y-1">
                {smartMutation.data.numbers.map((n) => {
                  const vote = smartMutation.data!.modelVotes[n];
                  if (!vote) return null;
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs">
                      <span className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs tabular-nums">
                        {n}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{vote.count} models</span>
                          <span className="text-primary font-medium tabular-nums">
                            score: {vote.weightedScore}
                          </span>
                        </div>
                        <div className="w-full bg-muted/20 rounded-full h-1 mt-0.5">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.min((vote.count / (smartMutation.data?.totalModelsUsed ?? 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Number selection grid */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Select Numbers{" "}
              <span className="text-muted-foreground font-normal">
                ({selectedNumbers.size} selected)
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {selectedNumbers.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  className="text-xs h-7 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick {cfg.mainCount}+ numbers from 1–{cfg.mainMax}. More numbers = more
            combinations.
            {wheelType === "key" && " Right-click a selected number to set it as the key."}
          </p>
        </CardHeader>
        <CardContent>
          <NumberSelector
            max={cfg.mainMax}
            selected={selectedNumbers}
            onToggle={toggleNumber}
            keyNumber={keyNumber}
            onKeyToggle={toggleKey}
            showKey={wheelType === "key"}
          />
        </CardContent>
      </Card>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={selectedNumbers.size < cfg.mainCount || generateMutation.isPending}
        className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
      >
        {generateMutation.isPending ? (
          <span className="flex items-center gap-2">
            <Cog className="w-5 h-5 animate-spin" />
            Generating…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Cog className="w-5 h-5" />
            Generate Wheel ({selectedNumbers.size} numbers)
          </span>
        )}
      </Button>

      {/* Results */}
      {result && !result.error && (
        <>
          <Card className="bg-card border-primary/30 glow-cyan-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-5 h-5 text-primary" />
                <span className="font-semibold">Wheel Results</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary tabular-nums">
                    {result.tickets.length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Tickets</p>
                </div>
                <div className="bg-muted/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400 tabular-nums">
                    ${result.totalCost}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Total Cost</p>
                </div>
                <div className="bg-muted/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-accent tabular-nums">
                    {result.coverage}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Coverage</p>
                </div>
                <div className="bg-muted/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-400 tabular-nums">
                    {result.totalPossibleCombos}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Total Possible</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground bg-muted/10 rounded-lg p-2">
                <span className="font-medium text-foreground capitalize">
                  {result.wheelType} wheel
                </span>{" "}
                &mdash; {result.coverage}% of all possible {result.totalPossibleCombos}{" "}
                combinations from your {selectedNumbers.size} selected numbers.
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ticket className="w-4 h-4 text-primary" />
                Generated Tickets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {result.tickets.map((ticket, i) => (
                <TicketCard key={i} ticket={ticket} gameConfig={cfg} index={i} />
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {result?.error && (
        <Card className="bg-card border-red-500/30">
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-400" />
            <p className="text-sm text-red-400">{result.error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
