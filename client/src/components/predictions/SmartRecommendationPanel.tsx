import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import type { PredictionResult } from "@shared/lottery";
import { LottoBall } from "./LottoBalls";
import { ConsensusChip, AgreementBar } from "./Confidence";

interface ConsensusNumber {
  number: number;
  modelCount: number;
  totalModels: number;
  weightedScore: number;
}

interface SmartRecommendationPanelProps {
  predictions: PredictionResult[];
  /** How many top consensus numbers to show */
  topN?: number;
  isSingleNumber?: boolean;
  onAddToPicks?: (numbers: number[]) => void;
}

export function SmartRecommendationPanel({
  predictions,
  topN = 5,
  isSingleNumber,
  onAddToPicks,
}: SmartRecommendationPanelProps) {
  const { consensus, validModelCount } = useMemo(() => {
    const valid = predictions.filter(p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data);
    const votes = new Map<number, { count: number; score: number }>();

    for (const pred of valid) {
      for (const n of pred.mainNumbers) {
        const entry = votes.get(n) || { count: 0, score: 0 };
        entry.count += 1;
        entry.score += pred.confidenceScore;
        votes.set(n, entry);
      }
    }

    const ranked: ConsensusNumber[] = [...votes.entries()]
      .map(([num, { count, score }]) => ({
        number: num,
        modelCount: count,
        totalModels: valid.length,
        weightedScore: score,
      }))
      .sort((a, b) => b.weightedScore - a.weightedScore);

    return { consensus: ranked.slice(0, topN), validModelCount: valid.length };
  }, [predictions, topN]);

  if (consensus.length === 0) return null;

  const topNumber = consensus[0];
  const agreementPct = Math.round((topNumber.modelCount / validModelCount) * 100);

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-card to-accent/5 border-primary/30 shadow-[0_0_20px_oklch(0.75_0.18_195/0.1)]">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base">Smart Picks</h3>
          </div>
          <ConsensusChip count={validModelCount} total={predictions.length} label="models" />
        </div>

        {/* Hero: top consensus number(s) */}
        <div className="flex items-center gap-4">
          <div className="flex gap-2 flex-wrap">
            {consensus.map(c => (
              <LottoBall
                key={c.number}
                number={c.number}
                size={isSingleNumber ? "lg" : "md"}
              />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              <span className="text-sm font-semibold text-green-400 font-tabular-nums">{agreementPct}% agreement</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {topNumber.modelCount} of {validModelCount} models agree on #{topNumber.number}
            </p>
          </div>
        </div>

        {/* Agreement bars for each consensus number */}
        <div className="space-y-2">
          {consensus.map(c => (
            <AgreementBar
              key={c.number}
              count={c.modelCount}
              total={validModelCount}
              label={`#${c.number}`}
            />
          ))}
        </div>

        {/* Action */}
        {onAddToPicks && (
          <Button
            onClick={() => onAddToPicks(consensus.map(c => c.number))}
            className="w-full"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Top Picks to Ticket
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
