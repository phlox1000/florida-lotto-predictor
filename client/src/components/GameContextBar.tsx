/**
 * GameContextBar — unified game selector + countdown header.
 *
 * Replaces the per-page game selectors and the Home page countdown.
 * Used at the top of every tab screen.
 *
 * Visual contract:
 *   [Game Chip Selector ─────────────────────────] [⏱ countdown]
 *
 * On mobile: horizontal scroll of game chips.
 * Countdown turns amber < 2 h, pulses red < 30 min.
 */
import { useGame } from "@/contexts/GameContext";
import type { GameType } from "@shared/lottery";
import { Clock } from "lucide-react";
import { useMemo } from "react";

// ─── Countdown urgency helpers ────────────────────────────────────────────────

function getCountdownClass(nextDraw: Date | null): string {
  if (!nextDraw) return "text-muted-foreground";
  const msLeft = nextDraw.getTime() - Date.now();
  if (msLeft < 30 * 60 * 1000) return "text-red-400 animate-pulse";
  if (msLeft < 2 * 60 * 60 * 1000) return "text-amber-400";
  return "text-muted-foreground";
}

// ─── Game chip ────────────────────────────────────────────────────────────────

function GameChip({
  game,
  isSelected,
  onClick,
}: {
  game: { id: GameType; name: string };
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
        ${
          isSelected
            ? "bg-primary text-primary-foreground glow-cyan-sm"
            : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
        }
      `}
    >
      {game.name}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface GameContextBarProps {
  /** Optional: restrict which games appear in the selector */
  allowedGames?: GameType[];
  /** Optional: hide the countdown (e.g. on the Tracker tab) */
  hideCountdown?: boolean;
  /** Optional: extra class on the outer container */
  className?: string;
}

export default function GameContextBar({
  allowedGames,
  hideCountdown = false,
  className = "",
}: GameContextBarProps) {
  const { selectedGame, setSelectedGame, activeGames, nextDraw, countdown } =
    useGame();

  const visibleGames = useMemo(
    () =>
      allowedGames
        ? activeGames.filter((g) => allowedGames.includes(g.id))
        : activeGames,
    [activeGames, allowedGames]
  );

  const countdownClass = getCountdownClass(nextDraw);

  return (
    <div
      className={`flex items-center justify-between gap-3 py-2 ${className}`}
    >
      {/* Scrollable game chips */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0 pb-0.5">
        {visibleGames.map((g) => (
          <GameChip
            key={g.id}
            game={g}
            isSelected={selectedGame === g.id}
            onClick={() => setSelectedGame(g.id)}
          />
        ))}
      </div>

      {/* Countdown */}
      {!hideCountdown && (
        <div
          className={`flex items-center gap-1.5 flex-shrink-0 text-xs font-mono tabular-nums ${countdownClass}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{countdown || "—"}</span>
        </div>
      )}
    </div>
  );
}
