import { Badge } from "@/components/ui/badge";
import { Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import { getModelDisplayName, getModelCategory } from "@shared/modelMetadata";

interface ModelLeaderboardRowProps {
  rank: number;
  modelName: string;
  avgMainHits: number;
  totalEvaluated: number;
  maxMainHits?: number;
  compositeScore?: number;
  onClick?: () => void;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground font-tabular-nums">#{rank}</span>;
}

function getCategoryColor(category: string) {
  const map: Record<string, string> = {
    Statistical: "bg-blue-500/20 text-blue-400",
    Probabilistic: "bg-purple-500/20 text-purple-400",
    Trend: "bg-green-500/20 text-green-400",
    Pattern: "bg-orange-500/20 text-orange-400",
    Temporal: "bg-cyan-500/20 text-cyan-400",
    Simulation: "bg-red-500/20 text-red-400",
    Sequential: "bg-pink-500/20 text-pink-400",
    Ensemble: "bg-primary/20 text-primary",
  };
  return map[category] || "bg-muted text-muted-foreground";
}

export function ModelLeaderboardRow({
  rank,
  modelName,
  avgMainHits,
  totalEvaluated,
  maxMainHits,
  compositeScore,
  onClick,
}: ModelLeaderboardRowProps) {
  const displayName = getModelDisplayName(modelName);
  const category = getModelCategory(modelName);

  const borderClass = rank === 1
    ? "border-yellow-400/50 bg-yellow-400/5"
    : rank === 2
    ? "border-gray-300/30 bg-gray-300/5"
    : rank === 3
    ? "border-amber-600/30 bg-amber-600/5"
    : "border-border/50";

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg border transition-colors",
        borderClass,
        onClick && "cursor-pointer hover:bg-secondary/30",
      )}
      onClick={onClick}
    >
      {/* Rank */}
      <div className="flex-shrink-0 w-8 flex justify-center">
        <RankBadge rank={rank} />
      </div>

      {/* Model info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{displayName}</span>
          <Badge className={cn("text-[10px] px-1.5 py-0", getCategoryColor(category))}>{category}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground font-tabular-nums">
          <span>Avg <span className="text-foreground font-medium">{avgMainHits.toFixed(2)}</span> hits</span>
          {maxMainHits != null && <span>Max <span className="text-foreground">{maxMainHits}</span></span>}
          <span>{totalEvaluated} evals</span>
        </div>
      </div>

      {/* Score */}
      {compositeScore != null && (
        <div className="text-right shrink-0">
          <div className="text-sm font-bold font-tabular-nums text-primary">{compositeScore.toFixed(3)}</div>
          <div className="text-[10px] text-muted-foreground">score</div>
        </div>
      )}
    </div>
  );
}
