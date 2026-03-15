import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, type PredictionResult } from "@shared/lottery";
import { Zap, DollarSign, Dices, Target, Sparkles, Printer, Heart, ShoppingCart, Filter, Info, Shuffle, ArrowLeftRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";

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

function ModelCard({ pred, gameType, onFavorite }: { pred: PredictionResult; gameType?: string; onFavorite?: (pred: PredictionResult) => void }) {
  const isOracle = pred.modelName === "ai_oracle";
  const isCdm = pred.modelName === "cdm";
  const isChiSquare = pred.modelName === "chi_square";
  const isNew = isCdm || isChiSquare;
  const meta = pred.metadata as Record<string, unknown>;
  const isInsufficient = meta?.insufficient_data === true;
  const sumFilter = meta?.sumRangeFilter as Record<string, unknown> | undefined;
  const wasAdjusted = sumFilter?.wasAdjusted === true;
  return (
    <Card className={`bg-card border-border/50 ${isInsufficient ? "opacity-60 border-yellow-500/20" : isOracle ? "border-accent/40 glow-gold-sm" : isNew ? "border-blue-500/30 hover:border-blue-500/50" : "hover:border-primary/30"} transition-all`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOracle ? <Sparkles className="w-4 h-4 text-accent" /> : isNew ? <Sparkles className="w-3.5 h-3.5 text-blue-400" /> : <Target className="w-3.5 h-3.5 text-primary/60" />}
            <span className="text-sm font-semibold">{pred.modelName === "cdm" ? "CDM" : pred.modelName === "chi_square" ? "Chi-Square" : pred.modelName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
            {isNew && <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-300 border-blue-500/30">NEW</Badge>}
          </div>
          <div className="flex items-center gap-1.5">
            {wasAdjusted && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="p-1 rounded-md text-amber-400">
                      <Filter className="w-3.5 h-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <p className="font-semibold mb-1">Sum/Range Filter Applied</p>
                    <p>Original sum: {String(sumFilter?.originalSum)} → Adjusted: {String(sumFilter?.adjustedSum)}</p>
                    <p>Acceptable range: [{String((sumFilter?.acceptableRange as number[])?.[0])}-{String((sumFilter?.acceptableRange as number[])?.[1])}]</p>
                    {(sumFilter?.notes as string[])?.map((n, i) => <p key={i} className="text-amber-300">{n}</p>)}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isInsufficient && onFavorite && (
              <button
                onClick={() => onFavorite(pred)}
                className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Save to Favorites"
              >
                <Heart className="w-3.5 h-3.5" />
              </button>
            )}
            <Badge variant="outline" className={`text-xs ${isInsufficient ? "border-yellow-500/40 text-yellow-400" : "border-border"}`}>
              {isInsufficient ? "needs data" : (meta?.strategy as string || "model")}
            </Badge>
          </div>
        </div>
        {isInsufficient ? (
          <div className="py-2 text-xs text-yellow-400/80 italic">
            {meta?.message as string || "Insufficient historical data for this model."}
          </div>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {pred.mainNumbers.map((n, i) => <LottoBall key={i} number={n} />)}
            {pred.specialNumbers.map((n, i) => <LottoBall key={`s-${i}`} number={n} variant="special" />)}
          </div>
        )}
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

function TicketCard({ ticket, index, onFavorite }: { ticket: TicketEntry; index: number; onFavorite?: (ticket: TicketEntry) => void }) {
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
      {onFavorite && (
        <button
          onClick={() => onFavorite(ticket)}
          className="p-2 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Save to Favorites"
        >
          <Heart className="w-4 h-4" />
        </button>
      )}
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
  const [sumRangeFilter, setSumRangeFilter] = useState(false);
  const { isAuthenticated } = useAuth();
  const generatePredictions = trpc.predictions.generate.useMutation();
  const generateTickets = trpc.tickets.generate.useMutation();
  const generateQuickPick = trpc.predictions.quickPick.useMutation();

  // Background sync: queue predictions when offline, auto-submit when back online
  const { queuePrediction } = useBackgroundSync(
    useCallback(async (gameType: string) => {
      await generatePredictions.mutateAsync({ gameType: gameType as GameType, sumRangeFilter });
    }, [generatePredictions, sumRangeFilter])
  );

  const handleRunModels = useCallback(() => {
    // If offline, queue the request instead
    if (queuePrediction(selectedGame)) return;
    generatePredictions.mutate({ gameType: selectedGame, sumRangeFilter });
  }, [selectedGame, sumRangeFilter, queuePrediction, generatePredictions]);
  const addFavorite = trpc.favorites.add.useMutation({
    onSuccess: () => toast.success("Saved to favorites!"),
    onError: () => toast.error("Failed to save. Please sign in first."),
  });

  const handleFavoritePred = useCallback((pred: PredictionResult) => {
    if (!isAuthenticated) { toast.error("Sign in to save favorites"); return; }
    addFavorite.mutate({
      gameType: selectedGame,
      mainNumbers: pred.mainNumbers,
      specialNumbers: pred.specialNumbers,
      modelSource: pred.modelName,
      confidence: pred.confidenceScore,
    });
  }, [isAuthenticated, selectedGame, addFavorite]);

  const handleFavoriteTicket = useCallback((ticket: TicketEntry) => {
    if (!isAuthenticated) { toast.error("Sign in to save favorites"); return; }
    addFavorite.mutate({
      gameType: selectedGame,
      mainNumbers: ticket.mainNumbers,
      specialNumbers: ticket.specialNumbers,
      modelSource: ticket.modelSource,
      confidence: ticket.confidence,
    });
  }, [isAuthenticated, selectedGame, addFavorite]);

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

  const logBulk = trpc.tracker.logBulkPurchase.useMutation({
    onSuccess: (data) => toast.success(`Logged ${data.count} tickets to your tracker!`),
    onError: () => toast.error("Failed to log purchases. Please sign in first."),
  });

  const handleLogPurchases = useCallback(() => {
    if (!isAuthenticated) { toast.error("Sign in to log purchases"); return; }
    if (!ticketData) return;
    const gameCfg = FLORIDA_GAMES[selectedGame];
    logBulk.mutate({
      tickets: (ticketData.tickets as TicketEntry[]).map(t => ({
        gameType: selectedGame,
        mainNumbers: t.mainNumbers,
        specialNumbers: t.specialNumbers?.length ? t.specialNumbers : undefined,
        cost: gameCfg.ticketPrice,
        modelSource: t.modelSource,
      })),
      purchaseDate: Date.now(),
    });
  }, [isAuthenticated, ticketData, selectedGame, logBulk]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Prediction Engine</h1>
            <p className="text-sm text-muted-foreground mt-1">Run all 18 models or generate budget-optimized tickets</p>
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
              onClick={handleRunModels}
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

        {/* Sum/Range Constraint Filter Toggle */}
        <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-secondary/30 border border-border/30">
          <Filter className="w-4 h-4 text-amber-400" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="sum-filter" className="text-sm font-medium cursor-pointer">Sum/Range Constraint Filter</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm text-xs">
                    <p className="font-semibold mb-1">What does this filter do?</p>
                    <p>Validates predictions against historically observed sum ranges (10th-90th percentile). Predictions whose number sums fall outside the common range are adjusted. Also flags odd/even and high/low imbalances.</p>
                    <p className="mt-1 text-amber-300">Toggle off to see raw model output; toggle on to see filtered results.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Adjust predictions to match historical sum ranges and balance patterns</p>
          </div>
          <Switch id="sum-filter" checked={sumRangeFilter} onCheckedChange={setSumRangeFilter} />
        </div>

        {generatePredictions.data?.sumRangeFilterApplied && (
          <div className="mb-4 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" />
            Sum/Range Constraint Filter was applied. Models with adjusted numbers show a <Filter className="w-3 h-3 inline" /> icon.
          </div>
        )}

        <Tabs defaultValue="models" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="models">18 Model Outputs</TabsTrigger>
            <TabsTrigger value="tickets">Budget Tickets</TabsTrigger>
            <TabsTrigger value="quickpick">vs Quick Pick</TabsTrigger>
          </TabsList>

          <TabsContent value="models">
            {predictions ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Showing predictions for <span className="text-primary font-medium">{generatePredictions.data?.gameName}</span> from all 18 models
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {/* AI Oracle first */}
                  {predictions.filter(p => p.modelName === "ai_oracle").map(p => (
                    <div key={p.modelName} className="sm:col-span-2 lg:col-span-1">
                      <ModelCard pred={p} gameType={selectedGame} onFavorite={handleFavoritePred} />
                    </div>
                  ))}
                  {predictions.filter(p => p.modelName !== "ai_oracle").map(p => (
                    <ModelCard key={p.modelName} pred={p} gameType={selectedGame} onFavorite={handleFavoritePred} />
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleLogPurchases}
                      disabled={logBulk.isPending}
                      className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                    >
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      {logBulk.isPending ? "Logging..." : "Log Purchases"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {ticketData.tickets.map((t, i) => (
                    <TicketCard key={i} ticket={t as TicketEntry} index={i} onFavorite={handleFavoriteTicket} />
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

          <TabsContent value="quickpick">
            <QuickPickComparison
              selectedGame={selectedGame}
              modelPredictions={predictions || null}
              quickPickData={generateQuickPick.data || null}
              onRunModels={() => generatePredictions.mutate({ gameType: selectedGame, sumRangeFilter })}
              onGenerateQuickPick={() => generateQuickPick.mutate({ gameType: selectedGame, count: 5 })}
              isRunningModels={generatePredictions.isPending}
              isGeneratingQP={generateQuickPick.isPending}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickPickComparison({
  selectedGame,
  modelPredictions,
  quickPickData,
  onRunModels,
  onGenerateQuickPick,
  isRunningModels,
  isGeneratingQP,
}: {
  selectedGame: GameType;
  modelPredictions: PredictionResult[] | null;
  quickPickData: { picks: Array<{ mainNumbers: number[]; specialNumbers: number[] }>; gameName: string } | null;
  onRunModels: () => void;
  onGenerateQuickPick: () => void;
  isRunningModels: boolean;
  isGeneratingQP: boolean;
}) {
  const gameCfg = FLORIDA_GAMES[selectedGame];

  // Get top 5 model predictions by confidence
  const topModels = useMemo(() => {
    if (!modelPredictions) return [];
    return [...modelPredictions]
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 5);
  }, [modelPredictions]);

  const handleRunBoth = () => {
    onRunModels();
    onGenerateQuickPick();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            Formula Picks vs Quick Pick
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Compare our 18-model formula predictions against pure random Quick Pick numbers.
          </p>
        </div>
        <Button onClick={handleRunBoth} disabled={isRunningModels || isGeneratingQP} className="bg-primary text-primary-foreground">
          <Shuffle className="w-4 h-4 mr-1" />
          {isRunningModels || isGeneratingQP ? "Generating..." : "Generate Both"}
        </Button>
      </div>

      {!topModels.length && !quickPickData ? (
        <div className="text-center py-16 text-muted-foreground">
          <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Click "Generate Both" to compare formula predictions against random Quick Picks</p>
          <p className="text-xs mt-2">Or run models first from the "18 Model Outputs" tab, then come back here.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Formula Picks (Left) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-primary">Formula Picks</h4>
                <p className="text-[10px] text-muted-foreground">Top 5 from 18 AI models</p>
              </div>
            </div>
            {topModels.length > 0 ? (
              <div className="space-y-2">
                {topModels.map((pred, i) => (
                  <div key={pred.modelName} className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      #{i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-1.5 flex-wrap mb-1">
                        {pred.mainNumbers.map((n, j) => <LottoBall key={j} number={n} />)}
                        {pred.specialNumbers.map((n, j) => <LottoBall key={`s-${j}`} number={n} variant="special" />)}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {pred.modelName.replace(/_/g, " ")} · {Math.round(pred.confidenceScore * 100)}% confidence
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg border border-border/30">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Run models first to see formula picks</p>
                <Button size="sm" variant="outline" onClick={onRunModels} disabled={isRunningModels} className="mt-2">
                  {isRunningModels ? "Running..." : "Run Models"}
                </Button>
              </div>
            )}
          </div>

          {/* Quick Picks (Right) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Shuffle className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-orange-400">Quick Picks</h4>
                <p className="text-[10px] text-muted-foreground">Pure random selection</p>
              </div>
            </div>
            {quickPickData ? (
              <div className="space-y-2">
                {quickPickData.picks.map((pick, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">
                      #{i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-1.5 flex-wrap mb-1">
                        {pick.mainNumbers.map((n, j) => (
                          <span key={j} className="lotto-ball" style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#000" }}>{n}</span>
                        ))}
                        {pick.specialNumbers.map((n, j) => (
                          <span key={`s-${j}`} className="lotto-ball lotto-ball-special">{n}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Random Quick Pick</p>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={onGenerateQuickPick} disabled={isGeneratingQP}
                  className="w-full mt-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
                  <Shuffle className="w-3.5 h-3.5 mr-1" />
                  {isGeneratingQP ? "Generating..." : "Re-Roll Quick Picks"}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg border border-border/30">
                <Shuffle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Generate random Quick Picks to compare</p>
                <Button size="sm" variant="outline" onClick={onGenerateQuickPick} disabled={isGeneratingQP} className="mt-2">
                  {isGeneratingQP ? "Generating..." : "Generate Quick Picks"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comparison Note */}
      {(topModels.length > 0 || quickPickData) && (
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/30 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How to compare</p>
          <p>
            After the next draw, check the <a href="/compare" className="text-primary underline">Results page</a> to see how many numbers each set matched.
            Formula picks use historical pattern analysis, while Quick Picks are purely random.
            Over time, the <a href="/leaderboard" className="text-primary underline">Leaderboard</a> tracks which approach performs better.
          </p>
        </div>
      )}
    </div>
  );
}
