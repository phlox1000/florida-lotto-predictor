import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getModelDisplayName } from "@shared/modelMetadata";
import { LottoBall, LottoBallRow } from "./LottoBalls";
import { InlineConfidence } from "./Confidence";

interface Ticket {
  mainNumbers: number[];
  specialNumbers: number[];
  modelSource: string;
  confidence: number;
}

interface TicketDisplayProps {
  tickets: Ticket[];
  totalCost: number;
  budget: number;
  gameName: string;
  ticketPrice: number;
  isSingleNumber?: boolean;
}

function TicketRow({ ticket, index, isSingleNumber }: { ticket: Ticket; index: number; isSingleNumber?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold font-tabular-nums shrink-0">
        #{index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {isSingleNumber ? (
            <LottoBall number={ticket.mainNumbers[0]} size="lg" />
          ) : (
            <LottoBallRow mainNumbers={ticket.mainNumbers} specialNumbers={ticket.specialNumbers} size="sm" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{getModelDisplayName(ticket.modelSource)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="font-mono font-tabular-nums">{Math.round(ticket.confidence * 100)}%</span>
        </div>
      </div>
      <InlineConfidence score={ticket.confidence} className="w-20 hidden sm:flex" />
    </div>
  );
}

export function TicketDisplay({ tickets, totalCost, budget, gameName, ticketPrice, isSingleNumber }: TicketDisplayProps) {
  return (
    <div className="space-y-3">
      {/* Batch summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-accent/50 text-accent font-tabular-nums">
            {tickets.length} tickets
          </Badge>
          <span className="text-sm text-muted-foreground">
            {gameName}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-tabular-nums">
          <span className="text-accent font-semibold">${totalCost}</span>
          <span className="text-muted-foreground">/ ${budget} budget</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground">${ticketPrice}/ea</span>
        </div>
      </div>

      {/* Ticket list */}
      <div className="space-y-2">
        {tickets.map((t, i) => (
          <TicketRow key={i} ticket={t} index={i} isSingleNumber={isSingleNumber} />
        ))}
      </div>
    </div>
  );
}
