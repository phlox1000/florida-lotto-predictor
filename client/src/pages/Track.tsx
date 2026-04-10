import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { getModelDisplayName } from "@shared/modelMetadata";
import { getLoginUrl } from "@/const";
import { ROIPanel, LottoBallRow, LottoBall } from "@/components/predictions";
import {
  LogIn, Plus, Clock, CheckCircle, XCircle,
  Trash2, TrendingUp, Calendar, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Sign-in Gate ─────────────────────────────────────────────────────────────

function SignInGate() {
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-8 text-center space-y-4">
        <LogIn className="w-10 h-10 mx-auto text-primary/40" />
        <div>
          <h3 className="font-semibold text-lg">Sign in to Track</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Track your tickets, monitor outcomes, and see your real ROI.
          </p>
        </div>
        <Button asChild>
          <a href={getLoginUrl()}>
            <LogIn className="w-4 h-4 mr-2" />
            Sign In
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Outcome Badge ────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "win") {
    return (
      <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">
        <CheckCircle className="w-3 h-3 mr-0.5" /> Won
      </Badge>
    );
  }
  if (outcome === "loss") {
    return (
      <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">
        <XCircle className="w-3 h-3 mr-0.5" /> Lost
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted/30 text-muted-foreground border-border/30 text-[10px]">
      <Clock className="w-3 h-3 mr-0.5" /> Pending
    </Badge>
  );
}

// ─── Ticket List ──────────────────────────────────────────────────────────────

function TicketList() {
  const { data: tickets, isLoading } = trpc.tracker.list.useQuery({ limit: 50 });
  const utils = trpc.useUtils();
  const deleteMut = trpc.tracker.delete.useMutation({
    onSuccess: () => { utils.tracker.list.invalidate(); utils.tracker.stats.invalidate(); toast.success("Ticket removed"); },
  });
  const updateMut = trpc.tracker.updateOutcome.useMutation({
    onSuccess: () => { utils.tracker.list.invalidate(); utils.tracker.stats.invalidate(); toast.success("Outcome updated"); },
  });

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>;
  }

  if (!tickets || tickets.length === 0) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="p-6 text-center">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No tracked tickets yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Generate picks and log your purchases to start tracking.</p>
        </CardContent>
      </Card>
    );
  }

  // Group by status
  const pending = tickets.filter(t => t.outcome === "pending");
  const resolved = tickets.filter(t => t.outcome !== "pending");

  return (
    <div className="space-y-4">
      {/* Pending section */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Pending ({pending.length})
          </h3>
          {pending.map(t => (
            <TicketRow key={t.id} ticket={t} onDelete={(id) => deleteMut.mutate({ id })} onResolve={(id, outcome, winAmount) => updateMut.mutate({ id, outcome, winAmount })} />
          ))}
        </div>
      )}

      {/* Resolved section */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Results ({resolved.length})
          </h3>
          {resolved.map(t => (
            <TicketRow key={t.id} ticket={t} onDelete={(id) => deleteMut.mutate({ id })} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  onDelete,
  onResolve,
}: {
  ticket: {
    id: number;
    gameType: string;
    mainNumbers: unknown;
    specialNumbers: unknown;
    purchaseDate: number;
    cost: number;
    outcome: string;
    winAmount: number | null;
    modelSource: string | null;
  };
  onDelete: (id: number) => void;
  onResolve?: (id: number, outcome: "win" | "loss", winAmount?: number) => void;
}) {
  const cfg = FLORIDA_GAMES[ticket.gameType as GameType];
  const mainNums = (ticket.mainNumbers as number[]) || [];
  const specialNums = (ticket.specialNumbers as number[]) || [];
  const isSingleNumber = cfg?.mainCount === 1;

  return (
    <div className="p-3 rounded-xl bg-card border border-border/50 space-y-2">
      {/* Header: game + date + outcome */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate">{cfg?.name || ticket.gameType}</span>
          <span className="text-[10px] text-muted-foreground font-tabular-nums">
            {new Date(ticket.purchaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <OutcomeBadge outcome={ticket.outcome} />
          {ticket.outcome === "win" && ticket.winAmount != null && ticket.winAmount > 0 && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px] font-tabular-nums">
              +${ticket.winAmount}
            </Badge>
          )}
        </div>
      </div>

      {/* Numbers */}
      <div className="flex items-center gap-2">
        {isSingleNumber ? (
          <LottoBall number={mainNums[0]} size="lg" />
        ) : (
          <LottoBallRow mainNumbers={mainNums} specialNumbers={specialNums} size="sm" />
        )}
      </div>

      {/* Footer: cost + model + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-tabular-nums">${ticket.cost}</span>
          {ticket.modelSource && (
            <>
              <span className="text-border">·</span>
              <span className="truncate max-w-[120px]">{getModelDisplayName(ticket.modelSource)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {ticket.outcome === "pending" && onResolve && (
            <>
              <button
                onClick={() => onResolve(ticket.id, "loss")}
                className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Mark as loss"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onResolve(ticket.id, "win", 0)}
                className="p-1 rounded text-muted-foreground hover:text-green-400 hover:bg-green-400/10 transition-colors"
                title="Mark as win"
              >
                <CheckCircle className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(ticket.id)}
            className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Delete ticket"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Accountability Insight ───────────────────────────────────────────────────

function AccountabilityInsight() {
  const { data: stats } = trpc.tracker.stats.useQuery();
  const { data: byGame } = trpc.tracker.statsByGame.useQuery();

  if (!stats || stats.totalTickets === 0) return null;

  const bestGame = byGame && byGame.length > 0
    ? [...byGame].sort((a, b) => {
        const roiA = Number(a.totalSpent) > 0 ? (Number(a.totalWon) - Number(a.totalSpent)) / Number(a.totalSpent) : 0;
        const roiB = Number(b.totalSpent) > 0 ? (Number(b.totalWon) - Number(b.totalSpent)) / Number(b.totalSpent) : 0;
        return roiB - roiA;
      })[0]
    : null;

  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Insights
        </h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Win rate</span>
            <span className="font-tabular-nums font-medium">
              {stats.totalTickets > 0 ? Math.round((stats.wins / stats.totalTickets) * 100) : 0}%
              <span className="text-muted-foreground ml-1">({stats.wins}/{stats.totalTickets})</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-tabular-nums">{stats.pending} tickets</span>
          </div>
          {bestGame && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best game</span>
              <span className="font-medium">{FLORIDA_GAMES[bestGame.gameType as GameType]?.name || bestGame.gameType}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Track Screen ─────────────────────────────────────────────────────────────

export default function Track() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container max-w-lg mx-auto py-4 px-4 space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-lg mx-auto py-4 px-4 space-y-4">

        {!isAuthenticated ? (
          <SignInGate />
        ) : (
          <TrackContent onNavigate={navigate} />
        )}
      </div>
    </div>
  );
}

function TrackContent({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { data: stats, isLoading: statsLoading } = trpc.tracker.stats.useQuery();

  return (
    <>
      {/* ROI Summary */}
      {statsLoading ? (
        <Skeleton className="h-24" />
      ) : stats ? (
        <ROIPanel
          totalSpent={stats.totalSpent}
          totalWon={stats.totalWon}
          ticketCount={stats.totalTickets}
        />
      ) : null}

      {/* Accountability insight */}
      <AccountabilityInsight />

      {/* Add ticket action */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => onNavigate("/generate")}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Generate & Log Picks
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate("/tracker")}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Manual Log
        </Button>
      </div>

      {/* Ticket status list */}
      <TicketList />
    </>
  );
}
