/**
 * TrackTab — the Track tab screen.
 *
 * Composition:
 *   ROI Dashboard (KPI grid)
 *   ↓
 *   Purchased Tickets list
 *
 * Uses exact tRPC procedure names from routers.ts:
 *   tracker.stats, tracker.statsByGame, tracker.list,
 *   tracker.logPurchase, tracker.updateOutcome, tracker.delete
 *   tickets.ticketAnalytics
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import {
  DollarSign, TrendingUp, TrendingDown, Trophy, Ticket, Plus, Trash2,
  LogIn, CheckCircle, XCircle, Clock, BarChart3, Target,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoadingState, EmptyState } from "@/components/StateViews";

// ─── ROIDashboard ─────────────────────────────────────────────────────────────

function ROIDashboard() {
  const { data: stats, isLoading } = trpc.tracker.stats.useQuery();
  const { data: byGame, isLoading: byGameLoading } = trpc.tracker.statsByGame.useQuery();
  const { data: ticketAnalytics, isLoading: analyticsLoading } = trpc.tickets.ticketAnalytics.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const roiPositive = stats.roi >= 0;

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Spent</span>
            </div>
            <p className="text-xl font-bold tabular-nums">${stats.totalSpent.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-accent" />
              <span className="text-xs text-muted-foreground">Total Won</span>
            </div>
            <p className="text-xl font-bold text-accent tabular-nums">${stats.totalWon.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card
          className={`border-border/50 ${
            roiPositive ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {roiPositive ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className="text-xs text-muted-foreground">ROI</span>
            </div>
            <p
              className={`text-xl font-bold tabular-nums ${
                roiPositive ? "text-green-400" : "text-red-400"
              }`}
            >
              {roiPositive ? "+" : ""}
              {stats.roi}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Ticket className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Tickets</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{stats.totalTickets}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {stats.wins}W / {stats.losses}L / {stats.pending}P
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-game breakdown */}
      {!byGameLoading && byGame && byGame.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              ROI by Game
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byGame.map((g: any) => {
              const spent = Number(g.totalSpent) || 0;
              const won = Number(g.totalWon) || 0;
              const roi = spent > 0 ? ((won - spent) / spent) * 100 : 0;
              const roiPos = roi >= 0;
              const gameCfg = FLORIDA_GAMES[g.gameType as GameType];
              return (
                <div
                  key={g.gameType}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/10"
                >
                  <span className="text-xs font-medium">
                    {gameCfg?.name || g.gameType}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {g.totalTickets} tickets
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      ${spent.toFixed(0)} spent
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        roiPos ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {roiPos ? "+" : ""}
                      {roi.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Model analytics */}
      {!analyticsLoading &&
        ticketAnalytics?.modelsPlayedMost &&
        ticketAnalytics.modelsPlayedMost.length > 0 && (
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                Top Models Played
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ticketAnalytics.modelsPlayedMost.slice(0, 5).map((m: any) => (
                <div
                  key={m.modelSource}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/10"
                >
                  <span className="text-xs font-medium capitalize">
                    {m.modelSource?.replace(/_/g, " ") || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {m.count} tickets
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
    </div>
  );
}

// ─── TicketList ───────────────────────────────────────────────────────────────

function TicketList() {
  const utils = trpc.useUtils();
  const { data: tickets, isLoading } = trpc.tracker.list.useQuery({ limit: 100 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [winAmount, setWinAmount] = useState("");

  const updateOutcome = trpc.tracker.updateOutcome.useMutation({
    onSuccess: () => {
      utils.tracker.list.invalidate();
      utils.tracker.stats.invalidate();
      utils.tracker.statsByGame.invalidate();
    },
  });

  const deleteTicket = trpc.tracker.delete.useMutation({
    onSuccess: () => {
      utils.tracker.list.invalidate();
      utils.tracker.stats.invalidate();
      utils.tracker.statsByGame.invalidate();
      toast.success("Ticket removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOutcome = (id: number, outcome: "win" | "loss") => {
    if (outcome === "win" && editingId !== id) {
      setEditingId(id);
      setWinAmount("");
      return;
    }
    const amount = outcome === "win" ? parseFloat(winAmount) || 0 : 0;
    updateOutcome.mutate(
      { id, outcome, winAmount: amount },
      {
        onSuccess: () => {
          toast.success(
            outcome === "win" ? `Win of $${amount} recorded!` : "Marked as loss"
          );
          setEditingId(null);
          setWinAmount("");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  if (isLoading) return <LoadingState rows={5} rowHeight="h-20" />;

  if (!tickets || tickets.length === 0) {
    return (
      <EmptyState
        icon={<Ticket className="w-12 h-12" />}
        title="No tickets logged yet"
        description='Tap "Log Purchase" to start tracking your tickets and ROI.'
      />
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => {
        const mainNums = ticket.mainNumbers as number[];
        const specialNums = (ticket.specialNumbers as number[]) || [];
        const gameName =
          FLORIDA_GAMES[ticket.gameType as GameType]?.name || ticket.gameType;
        const isWin = ticket.outcome === "win";
        const isLoss = ticket.outcome === "loss";
        const isPending = ticket.outcome === "pending";
        const isEditing = editingId === ticket.id;

        return (
          <Card
            key={ticket.id}
            className={`bg-card transition-all ${
              isWin
                ? "border-green-500/30 bg-green-500/5"
                : isLoss
                ? "border-red-500/20"
                : "border-border/50"
            }`}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isWin ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : isLoss ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{gameName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ${Number(ticket.cost).toFixed(2)}
                  </span>
                  {isWin && ticket.winAmount && (
                    <span className="text-xs font-semibold text-green-400 tabular-nums">
                      +${Number(ticket.winAmount).toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => deleteTicket.mutate({ id: ticket.id })}
                    disabled={deleteTicket.isPending}
                    className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Numbers */}
              <div className="flex gap-1.5 flex-wrap">
                {mainNums.map((n, i) => (
                  <span key={i} className="lotto-ball lotto-ball-main">
                    {n}
                  </span>
                ))}
                {specialNums.map((n, i) => (
                  <span key={`s-${i}`} className="lotto-ball lotto-ball-special">
                    {n}
                  </span>
                ))}
              </div>

              {/* Meta */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {ticket.modelSource && (
                    <span>{ticket.modelSource.replace(/_/g, " ")}</span>
                  )}
                  {ticket.mainHits != null && ticket.outcome !== "pending" && (
                    <Badge variant="outline" className="text-[10px] border-border">
                      {ticket.mainHits} hits
                    </Badge>
                  )}
                </div>
                <span>
                  {new Date(ticket.purchaseDate).toLocaleDateString()}
                </span>
              </div>

              {/* Outcome controls for pending tickets */}
              {isPending && !isEditing && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                    onClick={() => handleOutcome(ticket.id, "win")}
                    disabled={updateOutcome.isPending}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    Mark Won
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={() => handleOutcome(ticket.id, "loss")}
                    disabled={updateOutcome.isPending}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Mark Lost
                  </Button>
                </div>
              )}

              {/* Win amount entry */}
              {isEditing && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    value={winAmount}
                    onChange={(e) => setWinAmount(e.target.value)}
                    placeholder="Amount won ($)"
                    className="bg-background h-9 text-xs font-mono flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="bg-green-500 hover:bg-green-600 text-white"
                    onClick={() => handleOutcome(ticket.id, "win")}
                    disabled={updateOutcome.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── LogPurchaseDialog ────────────────────────────────────────────────────────

function LogPurchaseDialog() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [gameType, setGameType] = useState<GameType>("fantasy_5");
  const [mainNumbers, setMainNumbers] = useState("");
  const [specialNumbers, setSpecialNumbers] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [drawPeriod, setDrawPeriod] = useState<"" | "midday" | "evening">("");

  const gameOptions = GAME_TYPES.filter(
    (g) => !FLORIDA_GAMES[g].schedule.ended
  ).map((g) => FLORIDA_GAMES[g]);

  const logMutation = trpc.tracker.logPurchase.useMutation({
    onSuccess: () => {
      utils.tracker.list.invalidate();
      utils.tracker.stats.invalidate();
      utils.tracker.statsByGame.invalidate();
      toast.success("Ticket logged!");
      setOpen(false);
      setMainNumbers("");
      setSpecialNumbers("");
      setCost("");
      setNotes("");
      setDrawPeriod("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const main = mainNumbers
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    const special = specialNumbers
      ? specialNumbers
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => !isNaN(n) && n > 0)
      : [];
    const costNum = parseFloat(cost || String(FLORIDA_GAMES[gameType].ticketPrice));

    if (main.length === 0) {
      toast.error("Enter at least one main number");
      return;
    }
    if (isNaN(costNum) || costNum <= 0) {
      toast.error("Enter a valid cost");
      return;
    }

    const finalNotes = drawPeriod
      ? `Draw period: ${drawPeriod}${notes ? `. ${notes}` : ""}`
      : notes;

    logMutation.mutate({
      gameType,
      mainNumbers: main,
      specialNumbers: special.length ? special : undefined,
      cost: costNum,
      purchaseDate: Date.now(),
      notes: finalNotes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-1" />
          Log Purchase
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Log Ticket Purchase</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Game</Label>
            <Select
              value={gameType}
              onValueChange={(v) => setGameType(v as GameType)}
            >
              <SelectTrigger className="bg-background mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gameOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {FLORIDA_GAMES[gameType].drawingsPerDay > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground">Draw Period</Label>
              <Select
                value={drawPeriod}
                onValueChange={(v) =>
                  setDrawPeriod(v as "" | "midday" | "evening")
                }
              >
                <SelectTrigger className="bg-background mt-1">
                  <SelectValue placeholder="Select draw period (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not specified</SelectItem>
                  <SelectItem value="midday">Midday</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">
              Main Numbers (comma or space separated)
            </Label>
            <Input
              value={mainNumbers}
              onChange={(e) => setMainNumbers(e.target.value)}
              placeholder="e.g. 5 12 23 34 41"
              className="bg-background mt-1 font-mono"
            />
          </div>
          {FLORIDA_GAMES[gameType].specialCount > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">
                Special Number (e.g. Powerball, Mega Ball)
              </Label>
              <Input
                value={specialNumbers}
                onChange={(e) => setSpecialNumbers(e.target.value)}
                placeholder="e.g. 15"
                className="bg-background mt-1 font-mono"
              />
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">
              Cost ($) — default: ${FLORIDA_GAMES[gameType].ticketPrice}
            </Label>
            <Input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder={String(FLORIDA_GAMES[gameType].ticketPrice)}
              className="bg-background mt-1 font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this ticket"
              className="bg-background mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={logMutation.isPending}
            className="bg-primary text-primary-foreground"
          >
            {logMutation.isPending ? "Logging…" : "Log Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrackTab() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="px-4 pt-4">
        <LoadingState rows={4} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 py-16 text-center">
        <LogIn className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h2 className="text-xl font-semibold mb-2">Sign in to track your tickets</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Log your purchases, record wins, and track your ROI over time.
        </p>
        <Button asChild className="bg-primary text-primary-foreground">
          <a href="/login">Sign In</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-accent" />
            <h2 className="text-base font-bold">Win/Loss Tracker</h2>
          </div>
          <LogPurchaseDialog />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4 space-y-6 pb-4">
        <ROIDashboard />
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Ticket className="w-4 h-4 text-primary" />
              Purchased Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
