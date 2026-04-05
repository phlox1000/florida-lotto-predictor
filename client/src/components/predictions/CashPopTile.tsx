import { cn } from "@/lib/utils";
import { getModelDisplayName } from "@shared/modelMetadata";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Trend = "up" | "down" | "flat";

interface CashPopTileProps {
  number: number;
  modelName: string;
  confidence: number;
  trend?: Trend;
  isInsufficient?: boolean;
  onClick?: () => void;
}

function confidenceColor(score: number): string {
  if (score >= 0.65) return "bg-green-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-muted-foreground/40";
}

function TrendBadge({ trend }: { trend: Trend }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const color = trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";
  return (
    <span className={cn("absolute top-2 right-2", color)}>
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * Dedicated tile for Cash Pop — a single large number with model name
 * and confidence strip. NOT a reuse of PredictionCard; designed specifically
 * for the 1-of-15 single-number game's visual rhythm.
 *
 * Intended for a 2-column grid layout.
 */
export function CashPopTile({ number, modelName, confidence, trend, isInsufficient, onClick }: CashPopTileProps) {
  const displayName = getModelDisplayName(modelName);

  if (isInsufficient) {
    return (
      <div className="relative rounded-xl border border-yellow-500/20 bg-card/60 p-4 flex flex-col items-center justify-center opacity-50 min-h-[120px]">
        <span className="text-xs text-yellow-400 italic text-center">needs data</span>
        <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-full">{displayName}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card overflow-hidden transition-colors min-h-[120px]",
        modelName === "ai_oracle"
          ? "border-amber-400/40 shadow-[0_0_10px_oklch(0.85_0.17_85/0.12)]"
          : "border-border/50 hover:border-primary/30",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      {trend && <TrendBadge trend={trend} />}

      {/* Main content: large centered number */}
      <div className="flex flex-col items-center justify-center pt-5 pb-3 px-3">
        <span className="text-4xl font-extrabold font-tabular-nums text-foreground leading-none">
          {number}
        </span>
        <span className="text-[11px] text-muted-foreground mt-2 truncate max-w-full">
          {displayName}
        </span>
        <span className="text-[10px] font-mono font-tabular-nums text-muted-foreground/70 mt-0.5">
          {Math.round(confidence * 100)}%
        </span>
      </div>

      {/* Bottom confidence strip */}
      <div className="h-1.5 w-full">
        <div
          className={cn("h-full transition-all", confidenceColor(confidence))}
          style={{ width: `${Math.round(confidence * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Grid container for CashPopTile — enforces 2-column layout. */
export function CashPopGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {children}
    </div>
  );
}
