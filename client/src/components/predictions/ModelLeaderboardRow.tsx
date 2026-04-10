import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Crown, Medal } from "lucide-react";
import type { ReactNode } from "react";
import { getCategoryColor, MODEL_CATEGORIES, MODEL_DISPLAY_NAMES } from "./modelMeta";

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400 shrink-0" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-gray-300 shrink-0" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600 shrink-0" />;
  return <span className="w-4 h-4 flex items-center justify-center text-[10px] font-bold text-muted-foreground">#{rank}</span>;
}

function getRankBorder(rank: number) {
  if (rank === 1) return "border-yellow-400/40 bg-yellow-400/[0.06]";
  if (rank === 2) return "border-gray-400/25 bg-gray-400/[0.04]";
  if (rank === 3) return "border-amber-600/30 bg-amber-600/[0.05]";
  return "border-border/50";
}

export type ModelLeaderboardRowProps = {
  rank: number;
  modelKey: string;
  avgMainHits: number;
  evaluationCount: number;
  compositeScore?: number | null;
  showComposite?: boolean;
  isExpanded?: boolean;
  onToggle: () => void;
  detailSlot?: ReactNode;
};

export function ModelLeaderboardRow({
  rank,
  modelKey,
  avgMainHits,
  evaluationCount,
  compositeScore,
  showComposite = true,
  isExpanded = false,
  onToggle,
  detailSlot,
}: ModelLeaderboardRowProps) {
  const displayName = MODEL_DISPLAY_NAMES[modelKey] || modelKey;
  const category = MODEL_CATEGORIES[modelKey] || "Other";

  return (
    <Card
      className={`bg-card transition-colors cursor-pointer hover:border-primary/25 ${getRankBorder(rank)}`}
      onClick={onToggle}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="flex-shrink-0 w-8 sm:w-9 flex justify-center pt-0.5">{getRankIcon(rank)}</div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
              <span className="font-semibold text-sm text-foreground leading-tight">{displayName}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getCategoryColor(category)}`}>
                {category}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{evaluationCount.toLocaleString()} evaluations</p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
            <div className="flex items-baseline gap-2 sm:gap-3">
              <div>
                <p className="text-sm sm:text-base font-bold text-primary tabular-nums">{avgMainHits.toFixed(2)}</p>
                <p className="text-[9px] text-muted-foreground">avg hits</p>
              </div>
              {showComposite && compositeScore != null && (
                <div>
                  <p className="text-sm sm:text-base font-bold text-yellow-400/90 tabular-nums">{compositeScore.toFixed(3)}</p>
                  <p className="text-[9px] text-muted-foreground">composite</p>
                </div>
              )}
            </div>
            <span className="text-muted-foreground">{isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
          </div>
        </div>

        {detailSlot && isExpanded ? (
          <div className="mt-3 pt-3 border-t border-border/40" onClick={e => e.stopPropagation()}>
            {detailSlot}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
