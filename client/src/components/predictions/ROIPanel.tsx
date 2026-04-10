import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, Ticket, BarChart3 } from "lucide-react";

interface ROIPanelProps {
  totalSpent: number;
  totalWon: number;
  ticketCount: number;
  className?: string;
}

function StatBox({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2">
      <Icon className={cn("w-4 h-4", color || "text-muted-foreground")} />
      <span className={cn("text-lg font-bold font-tabular-nums", color || "text-foreground")}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

export function ROIPanel({ totalSpent, totalWon, ticketCount, className }: ROIPanelProps) {
  const roi = totalSpent > 0 ? ((totalWon - totalSpent) / totalSpent) * 100 : 0;
  const profit = totalWon - totalSpent;
  const isPositive = profit >= 0;

  const roiColor = isPositive ? "text-green-400" : "text-red-400";
  const RoiIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className={cn("bg-card border-border/50", className)}>
      <CardContent className="p-4">
        <div className="grid grid-cols-4 divide-x divide-border/30">
          <StatBox label="Spent" value={`$${totalSpent}`} icon={DollarSign} />
          <StatBox label="Won" value={`$${totalWon}`} icon={BarChart3} color={totalWon > 0 ? "text-green-400" : undefined} />
          <StatBox
            label="ROI"
            value={`${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`}
            icon={RoiIcon}
            color={roiColor}
          />
          <StatBox label="Tickets" value={String(ticketCount)} icon={Ticket} />
        </div>
      </CardContent>
    </Card>
  );
}
