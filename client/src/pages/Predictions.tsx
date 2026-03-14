import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, type PredictionResult } from "@shared/lottery";
import { Zap, DollarSign, Dices, Target, Sparkles, Printer } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "text-green-400" : pct >= 50 ? "text-accent" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 flex-1" />
      <span className={`text-xs font-mono ${color}`}>{pct}%</span>
    </div>
  );
}

function ModelCard({ pred }: { pred: PredictionResult }) {
  const isOracle = pred.modelName === "ai_oracle";
  return (
    <Card className={`bg-card border-border/50 ${isOracle ? "border-accent/40 glow-gold-sm" : "hover:border-primary/30"} transition-all`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOracle ? <Sparkles className="w-4 h-4 text-accent" /> : <Target className="w-3.5 h-3.5 text-primary/60" />}
            <span className="text-sm font-semibold">{pred.modelName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
          </div>
          <Badge variant="outline" className="text-xs border-border">
            {(pred.metadata as Record<string, unknown>)?.strategy as string || "model"}
          </Badge>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {pred.mainNumbers.map((n, i) => <LottoBall key={i} number={n} />)}
          {pred.specialNumbers.map((n, i) => <LottoBall key={`s-${i}`} number={n} variant="special" />)}
        </div>
        <ConfidenceMeter score={pred.confidenceScore} />
      </CardContent>
    </Card>
  );
}

interface TicketEntry {
  mainNumbers: number[];
  specialNumbers: number[];
  modelSource: string;
  confidence: number;
}

function TicketCard({ ticket, index }: { ticket: TicketEntry; index: number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
        #{index + 1}
      </div>
      <div className="flex-1">
        <div className="flex gap-1.5 flex-wrap mb-1">
          {ticket.mainNumbers.map((n, i) => <LottoBall key={i} number={n} />)}
          {ticket.specialNumbers.map((n, i) => <LottoBall key={`s-${i}`} number={n} variant="special" />)}
        </div>
        <p className="text-xs text-muted-foreground">
          Source: {ticket.modelSource.replace(/_/g, " ")} &middot; {Math.round(ticket.confidence * 100)}% confidence
        </p>
      </div>
    </div>
  );
}

/** Generate a printable HTML page and trigger print dialog */
function generatePrintableTickets(
  gameName: string,
  tickets: TicketEntry[],
  totalCost: number,
  budget: number
) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const ticketRows = tickets.map((t, i) => {
    const mainBalls = t.mainNumbers.map(n =>
      `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#00bcd4;color:#000;font-weight:700;font-size:14px;margin:2px;">${n}</span>`
    ).join("");
    const specialBalls = t.specialNumbers.map(n =>
      `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#ffc107;color:#000;font-weight:700;font-size:14px;margin:2px;">${n}</span>`
    ).join("");
    const model = t.modelSource.replace(/_/g, " ");
    const conf = Math.round(t.confidence * 100);

    return `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:8px;text-align:center;font-weight:700;color:#00bcd4;">${i + 1}</td>
        <td style="padding:8px;">${mainBalls}${specialBalls ? " " + specialBalls : ""}</td>
        <td style="padding:8px;font-size:12px;color:#666;">${model}</td>
        <td style="padding:8px;text-align:center;font-size:12px;">${conf}%</td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>FL Lotto Oracle - ${gameName} Tickets</title>
      <style>
        @media print {
          body { margin: 0; padding: 20px; }
          .no-print { display: none !important; }
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
          background: #fff;
        }
        .header {
          text-align: center;
          border-bottom: 3px solid #00bcd4;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          color: #00bcd4;
        }
        .header h2 {
          margin: 4px 0 0;
          font-size: 18px;
          color: #333;
          font-weight: 400;
        }
        .meta {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #666;
          margin-bottom: 16px;
          padding: 8px 12px;
          background: #f5f5f5;
          border-radius: 6px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background: #00bcd4;
          color: #fff;
          padding: 10px 8px;
          text-align: left;
          font-size: 13px;
        }
        th:first-child, th:last-child { text-align: center; }
        .footer {
          text-align: center;
          font-size: 11px;
          color: #999;
          border-top: 1px solid #ddd;
          padding-top: 12px;
          margin-top: 20px;
        }
        .summary {
          display: flex;
          justify-content: center;
          gap: 24px;
          padding: 12px;
          background: #e0f7fa;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 14px;
        }
        .summary strong { color: #00838f; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>FL Lotto Oracle</h1>
        <h2>${gameName} - Ticket Selection</h2>
      </div>

      <div class="meta">
        <span>Generated: ${dateStr} at ${timeStr}</span>
        <span>Powered by 16 AI Prediction Models</span>
      </div>

      <div class="summary">
        <span><strong>${tickets.length}</strong> Tickets</span>
        <span>Budget: <strong>$${totalCost}</strong> / $${budget}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th>Numbers</th>
            <th style="width:120px;">Model</th>
            <th style="width:60px;">Conf.</th>
          </tr>
        </thead>
        <tbody>
          ${ticketRows}
        </tbody>
      </table>

      <div class="footer">
        <p>FL Lotto Oracle &middot; For entertainment purposes only &middot; Play responsibly</p>
        <p>Lottery outcomes are random. No prediction system can guarantee wins.</p>
      </div>

      <div class="no-print" style="text-align:center;margin-top:20px;">
        <button onclick="window.print()" style="padding:10px 24px;background:#00bcd4;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;">
          Print This Page
        </button>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    // Auto-trigger print after a short delay for rendering
    setTimeout(() => {
      printWindow.print();
    }, 500);
  } else {
    toast.error("Pop-up blocked. Please allow pop-ups to print tickets.");
  }
}

export default function Predictions() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const generatePredictions = trpc.predictions.generate.useMutation();
  const generateTickets = trpc.tickets.generate.useMutation();

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const predictions = generatePredictions.data?.predictions;
  const ticketData = generateTickets.data;

  const handlePrint = useCallback(() => {
    if (!ticketData) return;
    generatePrintableTickets(
      ticketData.gameName,
      ticketData.tickets as TicketEntry[],
      ticketData.totalCost,
      75
    );
    toast.success("Print dialog opened in a new window");
  }, [ticketData]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Prediction Engine</h1>
            <p className="text-sm text-muted-foreground mt-1">Run all 16 models or generate budget-optimized tickets</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            <Select value={selectedGame} onValueChange={(v) => setSelectedGame(v as GameType)}>
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gameOptions.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => generatePredictions.mutate({ gameType: selectedGame })}
              disabled={generatePredictions.isPending}
              className="bg-primary text-primary-foreground"
            >
              <Zap className="w-4 h-4 mr-1" />
              {generatePredictions.isPending ? "Running..." : "Run Models"}
            </Button>
            <Button
              variant="outline"
              onClick={() => generateTickets.mutate({ gameType: selectedGame, budget: 75, maxTickets: 20 })}
              disabled={generateTickets.isPending}
              className="border-accent/50 text-accent hover:bg-accent/10"
            >
              <DollarSign className="w-4 h-4 mr-1" />
              {generateTickets.isPending ? "Selecting..." : "$75 Tickets"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="models" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="models">16 Model Outputs</TabsTrigger>
            <TabsTrigger value="tickets">Budget Tickets</TabsTrigger>
          </TabsList>

          <TabsContent value="models">
            {predictions ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Showing predictions for <span className="text-primary font-medium">{generatePredictions.data?.gameName}</span> from all 16 models
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {/* AI Oracle first */}
                  {predictions.filter(p => p.modelName === "ai_oracle").map(p => (
                    <div key={p.modelName} className="sm:col-span-2 lg:col-span-1">
                      <ModelCard pred={p} />
                    </div>
                  ))}
                  {predictions.filter(p => p.modelName !== "ai_oracle").map(p => (
                    <ModelCard key={p.modelName} pred={p} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Dices className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a game and click "Run Models" to generate predictions</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tickets">
            {ticketData ? (
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="text-accent font-medium">{ticketData.tickets.length} tickets</span> for{" "}
                    <span className="text-primary font-medium">{ticketData.gameName}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-accent/50 text-accent">
                      Total: ${ticketData.totalCost} / ${75} budget
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePrint}
                      className="border-primary/50 text-primary hover:bg-primary/10"
                    >
                      <Printer className="w-4 h-4 mr-1" />
                      Print Tickets
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {ticketData.tickets.map((t, i) => (
                    <TicketCard key={i} ticket={t as TicketEntry} index={i} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Click "$75 Tickets" to generate 20 budget-optimized tickets</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
