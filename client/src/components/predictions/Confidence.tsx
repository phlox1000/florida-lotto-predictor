import { cn } from "@/lib/utils";

type Strength = "strong" | "moderate" | "weak";

function getStrength(value: number): Strength {
  if (value >= 0.65) return "strong";
  if (value >= 0.4) return "moderate";
  return "weak";
}

const strengthBarColors: Record<Strength, string> = {
  strong: "bg-green-500",
  moderate: "bg-amber-500",
  weak: "bg-muted-foreground/40",
};

const strengthTextColors: Record<Strength, string> = {
  strong: "text-green-400",
  moderate: "text-amber-400",
  weak: "text-muted-foreground",
};

const strengthChipColors: Record<Strength, string> = {
  strong: "bg-green-500/15 text-green-400 border-green-500/30",
  moderate: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  weak: "bg-muted/30 text-muted-foreground border-border/30",
};

/** Horizontal progress bar with percentage label. */
export function InlineConfidence({ score, className }: { score: number; className?: string }) {
  const pct = Math.round(score * 100);
  const strength = getStrength(score);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", strengthBarColors[strength])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs font-mono font-tabular-nums min-w-[2.5rem] text-right", strengthTextColors[strength])}>
        {pct}%
      </span>
    </div>
  );
}

/** Small pill showing agreement count out of total (e.g. "12/18 models"). */
export function ConsensusChip({
  count,
  total,
  label,
  className,
}: {
  count: number;
  total: number;
  label?: string;
  className?: string;
}) {
  const strength = getStrength(total > 0 ? count / total : 0);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border font-tabular-nums",
        strengthChipColors[strength],
        className,
      )}
    >
      {count}/{total}
      {label && <span className="text-[10px] opacity-70">{label}</span>}
    </span>
  );
}

/** Full-width bar for ranking a number's model agreement. */
export function AgreementBar({
  count,
  total,
  label,
  className,
}: {
  count: number;
  total: number;
  label?: string;
  className?: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const strength = getStrength(total > 0 ? count / total : 0);
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn("font-mono font-tabular-nums", strengthTextColors[strength])}>
            {count}/{total}
          </span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", strengthBarColors[strength])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
