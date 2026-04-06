import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { Timer } from "lucide-react";
import { useEffect, useState } from "react";

type ScheduleRow = {
  gameType: GameType;
  gameName: string;
  nextDraw: string | null;
  countdown: string;
  schedule: { ended?: boolean };
};

function useLiveCountdown(nextDrawIso: string | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  if (!nextDrawIso) return null;
  const target = new Date(nextDrawIso);
  const now = new Date();
  const etOffset = -5;
  const etNow = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
  const diff = target.getTime() - etNow.getTime();
  if (diff <= 0) return "Drawing now or soon";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function GameContextHeader({
  selectedGame,
  onGameChange,
  scheduleRows,
  isLoading,
}: {
  selectedGame: GameType;
  onGameChange: (g: GameType) => void;
  scheduleRows: ScheduleRow[] | undefined;
  isLoading: boolean;
}) {
  const gameOptions = GAME_TYPES.filter(g => !FLORIDA_GAMES[g].schedule.ended).map(g => ({
    id: g,
    name: FLORIDA_GAMES[g].name,
  }));

  const row = scheduleRows?.find(r => r.gameType === selectedGame);
  const live = useLiveCountdown(row?.nextDraw ?? null);
  const countdownLabel = row?.schedule.ended ? "Game ended" : live ?? row?.countdown ?? "—";

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Game</p>
          <p className="text-lg font-semibold text-foreground">{FLORIDA_GAMES[selectedGame].name}</p>
        </div>
        <div className="w-full sm:w-[min(100%,220px)]">
          <Select value={selectedGame} onValueChange={v => onGameChange(v as GameType)}>
            <SelectTrigger className="h-10 bg-background/80 border-border/60">
              <SelectValue placeholder="Select game" />
            </SelectTrigger>
            <SelectContent>
              {gameOptions.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground border-t border-border/40 pt-3">
        <Timer className="w-4 h-4 shrink-0 text-primary/80" />
        {isLoading ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <span>
            Next draw: <span className="text-foreground font-medium tabular-nums">{countdownLabel}</span>
          </span>
        )}
      </div>
    </div>
  );
}
