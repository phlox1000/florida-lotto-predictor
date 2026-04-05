import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Target, ChevronDown, ChevronUp } from "lucide-react";
import { getModelDisplayName, getModelCategory } from "@shared/modelMetadata";
import type { PredictionResult } from "@shared/lottery";
import { LottoBallRow } from "./LottoBalls";
import { InlineConfidence } from "./Confidence";

interface PredictionCardProps {
  prediction: PredictionResult;
  /** Single-number game (Cash Pop) — use CashPopTile instead for best UX. */
  isSingleNumber?: boolean;
  onTap?: (pred: PredictionResult) => void;
  onLongPress?: (pred: PredictionResult) => void;
}

export function PredictionCard({ prediction, isSingleNumber, onTap, onLongPress }: PredictionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = prediction.metadata as Record<string, unknown>;
  const isInsufficient = meta?.insufficient_data === true;
  const isOracle = prediction.modelName === "ai_oracle";
  const strategy = meta?.strategy as string | undefined;
  const sumFilter = meta?.sumRangeFilter as Record<string, unknown> | undefined;
  const wasAdjusted = sumFilter?.wasAdjusted === true;

  const displayName = getModelDisplayName(prediction.modelName);
  const category = getModelCategory(prediction.modelName);

  let timerRef: ReturnType<typeof setTimeout> | null = null;

  function handlePointerDown() {
    if (!onLongPress) return;
    timerRef = setTimeout(() => onLongPress(prediction), 500);
  }
  function handlePointerUp() {
    if (timerRef) clearTimeout(timerRef);
  }
  function handleClick() {
    if (onTap) onTap(prediction);
    else setExpanded(e => !e);
  }

  return (
    <Card
      className={
        isInsufficient
          ? "bg-card/60 border-yellow-500/20 opacity-60"
          : isOracle
          ? "bg-card border-amber-400/40 shadow-[0_0_12px_oklch(0.85_0.17_85/0.15)]"
          : "bg-card border-border/50 hover:border-primary/30 transition-colors"
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: model identity + category */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {isOracle ? (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Target className="w-3.5 h-3.5 text-primary/60 shrink-0" />
            )}
            <span className="text-sm font-semibold truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {wasAdjusted && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">filtered</Badge>}
            <Badge variant="outline" className="text-[10px]">{category}</Badge>
          </div>
        </div>

        {/* Numbers — the largest visual element */}
        {isInsufficient ? (
          <p className="text-xs text-yellow-400/80 italic py-2">
            {meta?.message as string || "Insufficient historical data."}
          </p>
        ) : isSingleNumber ? (
          <div className="flex items-center gap-3 py-1">
            <span className="lotto-ball lotto-ball-main lotto-ball-single">{prediction.mainNumbers[0]}</span>
            <span className="text-xs text-muted-foreground">Pick this number</span>
          </div>
        ) : (
          <LottoBallRow mainNumbers={prediction.mainNumbers} specialNumbers={prediction.specialNumbers} />
        )}

        {/* Confidence */}
        {!isInsufficient && <InlineConfidence score={prediction.confidenceScore} />}

        {/* Expandable detail */}
        {expanded && !isInsufficient && (
          <div className="pt-2 border-t border-border/30 text-xs text-muted-foreground space-y-1">
            {strategy && <p>Strategy: <span className="text-foreground">{strategy.replace(/_/g, " ")}</span></p>}
            {meta?.drawsUsed != null && <p>Draws used: <span className="text-foreground font-tabular-nums">{String(meta.drawsUsed)}</span></p>}
            {meta?.lookback != null && <p>Lookback: <span className="text-foreground font-tabular-nums">{String(meta.lookback)}</span></p>}
          </div>
        )}

        {/* Expand hint */}
        <button className="w-full flex justify-center pt-0.5" onClick={(e) => { e.stopPropagation(); setExpanded(e2 => !e2); }}>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />}
        </button>
      </CardContent>
    </Card>
  );
}
