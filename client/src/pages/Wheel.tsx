import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { Cog, Ticket, DollarSign, Target, Percent, Trash2, Plus, Info, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

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
  // For large pools (like Powerball 1-69), show in a grid
  const cols = max <= 12 ? "grid-cols-6" : max <= 36 ? "grid-cols-9" : max <= 53 ? "grid-cols-10" : "grid-cols-10";

  return (
    <div className={`grid ${cols} gap-1.5`}>
      {numbers.map(n => {
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
              ${isKey
                ? "bg-yellow-400 text-black ring-2 ring-yellow-400/50 scale-110"
                : isSelected
                  ? "bg-primary text-primary-foreground ring-1 ring-primary/50"
                  : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }
            `}
          >
            {n}
            {isKey && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-600 flex items-center justify-center text-[8px] text-white">K</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TicketCard({ ticket, gameConfig, index }: { ticket: { mainNumbers: number[]; ticketNumber: number }; gameConfig: typeof FLORIDA_GAMES[GameType]; index: number }) {
  return (
    <div className="flex items-center gap-3 bg-muted/10 rounded-lg px-3 py-2">
      <span className="text-xs text-muted-foreground w-8 flex-shrink-0">#{ticket.ticketNumber}</span>
      <div className="flex gap-1.5 flex-wrap">
        {ticket.mainNumbers.map((n, i) => (
          <span
            key={i}
            className="w-8 h-8 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center"
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Wheel() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [wheelType, setWheelType] = useState<"full" | "abbreviated" | "key">("abbreviated");
  const [keyNumber, setKeyNumber] = useState<number | null>(null);
  const [maxTickets, setMaxTickets] = useState(50);

  const cfg = FLORIDA_GAMES[selectedGame];
  const isDigitGame = cfg.isDigitGame;

  const gameOptions = GAME_TYPES
    .filter(g => !FLORIDA_GAMES[g].isDigitGame && !FLORIDA_GAMES[g].schedule.ended)
    .map(g => FLORIDA_GAMES[g]);

  const generateMutation = trpc.wheel.generate.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const toggleNumber = (n: number) => {
    setSelectedNumbers(prev => {
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
    setKeyNumber(prev => prev === n ? null : n);
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

  const handleGameChange = (g: GameType) => {
    setSelectedGame(g);
    setSelectedNumbers(new Set());
    setKeyNumber(null);
    generateMutation.reset();
  };

  const result = generateMutation.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="container py-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Cog className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-3xl font-bold">Number Wheel</h1>
            </div>
            <p className="text-muted-foreground">
              Generate systematic wheeling combinations to maximize coverage within your budget.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Game & Wheel Type Selection */}
            <Card className="bg-card border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Game</Label>
                    <Select value={selectedGame} onValueChange={(v) => handleGameChange(v as GameType)}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {gameOptions.map(g => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Wheel Type</Label>
                    <Select value={wheelType} onValueChange={(v) => setWheelType(v as typeof wheelType)}>
                      <SelectTrigger className="bg-background">
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
                    <Select value={String(maxTickets)} onValueChange={(v) => setMaxTickets(Number(v))}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 tickets</SelectItem>
                        <SelectItem value="20">20 tickets</SelectItem>
                        <SelectItem value="30">30 tickets</SelectItem>
                        <SelectItem value="50">50 tickets</SelectItem>
                        <SelectItem value="100">100 tickets</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Wheel Type Info */}
                <div className="bg-muted/10 rounded-lg p-3 text-xs text-muted-foreground flex gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    {wheelType === "full" && (
                      <span>
                        <strong className="text-foreground">Full Wheel:</strong> Every possible combination of your selected numbers.
                        Guarantees a jackpot if all winning numbers are in your pool, but generates the most tickets.
                      </span>
                    )}
                    {wheelType === "abbreviated" && (
                      <span>
                        <strong className="text-foreground">Abbreviated Wheel:</strong> Balanced coverage with fewer tickets.
                        Each number appears roughly equally across all tickets. Best balance of cost vs. coverage.
                      </span>
                    )}
                    {wheelType === "key" && (
                      <span>
                        <strong className="text-foreground">Key Number Wheel:</strong> One "key" number appears in every ticket.
                        Use this when you have high confidence in one specific number. Right-click a selected number to set it as key.
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Number Selection Grid */}
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Select Numbers
                    <Badge variant="outline" className="text-xs border-border ml-2">
                      {selectedNumbers.size} / {cfg.mainMax} selected
                    </Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick {cfg.mainCount}+ numbers from 1-{cfg.mainMax}. More numbers = more combinations.
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

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={selectedNumbers.size < cfg.mainCount || generateMutation.isPending}
              className="w-full h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
            >
              {generateMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Cog className="w-5 h-5 animate-spin" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Cog className="w-5 h-5" />
                  Generate Wheel ({selectedNumbers.size} numbers)
                </span>
              )}
            </Button>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-1 space-y-4">
            {/* Results Summary */}
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
                        <p className="text-2xl font-bold text-primary">{result.tickets.length}</p>
                        <p className="text-[10px] text-muted-foreground">Tickets</p>
                      </div>
                      <div className="bg-muted/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-400">${result.totalCost}</p>
                        <p className="text-[10px] text-muted-foreground">Total Cost</p>
                      </div>
                      <div className="bg-muted/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-accent">{result.coverage}%</p>
                        <p className="text-[10px] text-muted-foreground">Coverage</p>
                      </div>
                      <div className="bg-muted/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-yellow-400">{result.totalPossibleCombos}</p>
                        <p className="text-[10px] text-muted-foreground">Total Possible</p>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground bg-muted/10 rounded-lg p-2">
                      <span className="font-medium text-foreground capitalize">{result.wheelType} wheel</span>
                      {" "}&mdash; {result.coverage}% of all possible {result.totalPossibleCombos} combinations from your {selectedNumbers.size} selected numbers.
                    </div>
                  </CardContent>
                </Card>

                {/* Ticket List */}
                <Card className="bg-card border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-primary" />
                      Generated Tickets
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
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

            {!result && (
              <Card className="bg-card border-border/50">
                <CardContent className="py-12 text-center">
                  <Cog className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Select your numbers and click Generate to create wheeling combinations.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
