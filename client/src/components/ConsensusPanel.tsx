import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, TrendingUp, Star, Info } from "lucide-react";
import { useMemo } from "react";
import type { PredictionResult } from "@shared/lottery";

interface ConsensusNumber {
  number: number;
  count: number;
  percentage: number;
  models: string[];
  strength: "strong" | "moderate" | "weak";
}

function getStrength(count: number, total: number): "strong" | "moderate" | "weak" {
  const pct = count / total;
  if (pct >= 0.6) return "strong";
  if (pct >= 0.35) return "moderate";
  return "weak";
}

function getStrengthColor(strength: "strong" | "moderate" | "weak") {
  if (strength === "strong") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (strength === "moderate") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-muted/30 text-muted-foreground border-border/30";
}

function getBarColor(strength: "strong" | "moderate" | "weak") {
  if (strength === "strong") return "bg-green-500";
  if (strength === "moderate") return "bg-yellow-500";
  return "bg-muted-foreground/30";
}

export default function ConsensusPanel({ predictions }: { predictions: PredictionResult[] }) {
  const totalModels = predictions.length;

  const { mainConsensus, specialConsensus, topPick } = useMemo(() => {
    const mainCounts: Record<number, string[]> = {};
    const specialCounts: Record<number, string[]> = {};

    for (const pred of predictions) {
      const displayName = pred.modelName === "cdm" ? "CDM" : pred.modelName === "chi_square" ? "Chi-Square" : pred.modelName.replace(/_/g, " ");
      for (const n of pred.mainNumbers) {
        if (!mainCounts[n]) mainCounts[n] = [];
        mainCounts[n].push(displayName);
      }
      for (const n of pred.specialNumbers) {
        if (!specialCounts[n]) specialCounts[n] = [];
        specialCounts[n].push(displayName);
      }
    }

    const toConsensus = (counts: Record<number, string[]>): ConsensusNumber[] =>
      Object.entries(counts)
        .map(([num, models]) => ({
          number: Number(num),
          count: models.length,
          percentage: Math.round((models.length / totalModels) * 100),
          models,
          strength: getStrength(models.length, totalModels),
        }))
        .sort((a, b) => b.count - a.count);

    const main = toConsensus(mainCounts);
    const special = toConsensus(specialCounts);
    const top = main.length > 0 ? main[0] : null;

    return { mainConsensus: main, specialConsensus: special, topPick: top };
  }, [predictions, totalModels]);

  if (predictions.length === 0) return null;

  const strongMain = mainConsensus.filter(c => c.strength === "strong");
  const moderateMain = mainConsensus.filter(c => c.strength === "moderate");

  return (
    <Card className="bg-gradient-to-br from-card to-primary/5 border-primary/20 mb-6">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Consensus Strength Score</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm text-xs">
                  <p className="font-semibold mb-1">How it works</p>
                  <p>Shows how many of the 18 models agree on each number. A number picked by 14/18 models is a much stronger signal than one picked by 3/18.</p>
                  <p className="mt-1"><span className="text-green-400">Strong (60%+)</span> · <span className="text-yellow-400">Moderate (35-59%)</span> · <span className="text-muted-foreground">Weak (&lt;35%)</span></p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
            {totalModels} models analyzed
          </Badge>
        </div>

        {/* Top Consensus Pick */}
        {topPick && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <Star className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-400">
                Top Consensus: Number {topPick.number}
              </p>
              <p className="text-xs text-muted-foreground">
                Picked by {topPick.count}/{totalModels} models ({topPick.percentage}% agreement)
              </p>
            </div>
          </div>
        )}

        {/* Strong Consensus Numbers */}
        {strongMain.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs font-medium text-green-400">Strong Consensus (60%+ agreement)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {strongMain.map(c => (
                <ConsensusChip key={c.number} item={c} totalModels={totalModels} />
              ))}
            </div>
          </div>
        )}

        {/* Moderate Consensus Numbers */}
        {moderateMain.length > 0 && (
          <div>
            <span className="text-xs font-medium text-yellow-400 mb-2 block">Moderate Consensus (35-59%)</span>
            <div className="flex flex-wrap gap-2">
              {moderateMain.map(c => (
                <ConsensusChip key={c.number} item={c} totalModels={totalModels} />
              ))}
            </div>
          </div>
        )}

        {/* Special Numbers Consensus */}
        {specialConsensus.length > 0 && (
          <div>
            <span className="text-xs font-medium text-accent mb-2 block">Special Number Consensus</span>
            <div className="flex flex-wrap gap-2">
              {specialConsensus.filter(c => c.strength !== "weak").map(c => (
                <ConsensusChip key={c.number} item={c} totalModels={totalModels} isSpecial />
              ))}
              {specialConsensus.filter(c => c.strength !== "weak").length === 0 && (
                <span className="text-xs text-muted-foreground">No strong consensus on special numbers</span>
              )}
            </div>
          </div>
        )}

        {/* Full Heatmap Bar */}
        <div>
          <span className="text-xs font-medium text-muted-foreground mb-2 block">All Numbers by Agreement</span>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {mainConsensus.slice(0, 20).map(c => (
              <div key={c.number} className="flex items-center gap-2">
                <span className="w-6 text-right text-xs font-mono text-muted-foreground">{c.number}</span>
                <div className="flex-1 h-4 rounded-full bg-muted/20 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getBarColor(c.strength)}`}
                    style={{ width: `${c.percentage}%` }}
                  />
                </div>
                <span className={`w-12 text-right text-[10px] font-mono ${
                  c.strength === "strong" ? "text-green-400" : c.strength === "moderate" ? "text-yellow-400" : "text-muted-foreground"
                }`}>
                  {c.count}/{totalModels}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsensusChip({ item, totalModels, isSpecial = false }: { item: ConsensusNumber; totalModels: number; isSpecial?: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${getStrengthColor(item.strength)} cursor-default`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              isSpecial ? "bg-accent/30 text-accent" : item.strength === "strong" ? "bg-green-500/30 text-green-300" : "bg-yellow-500/30 text-yellow-300"
            }`}>
              {item.number}
            </span>
            <span className="text-xs font-mono">{item.count}/{totalModels}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold mb-1">Number {item.number} — {item.percentage}% agreement</p>
          <p className="text-muted-foreground">Picked by: {item.models.join(", ")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
