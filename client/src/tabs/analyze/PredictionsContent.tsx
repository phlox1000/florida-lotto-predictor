/**
 * PredictionsContent — the predictions sub-tab within AnalyzeTab.
 *
 * Reads selectedGame from GameContext (no local game state).
 * All prediction logic is identical to the original Predictions page,
 * but the Navbar and game selector are removed — those live in the shell.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, type GameType, type PredictionResult } from "@shared/lottery";
import {
  Zap, DollarSign, Dices, Target, Sparkles, Printer, Heart,
  ShoppingCart, Filter, Shuffle, ArrowLeftRight,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useBackgroundSync } from "@/hooks/useBackgroundSync";
import ConsensusPanel from "@/components/ConsensusPanel";
import { useGame } from "@/contexts/GameContext";
import { EmptyState, LoadingState } from "@/components/StateViews";
import {
  getModelDisplayName,
  getConfidenceTier,
  formatConfidence,
} from "@/services/modelInsightsService";

// ─── Local helpers ────────────────────────────────────────────────────────────

interface TicketEntry {
  mainNumbers: number[];
  specialNumbers: number[];
  modelSource: string;
  confidence: number;
}

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

function ConfidenceMeter({ score }: { score: number }) {
  const tier = getConfidenceTier(score);
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 flex-1" />
      <span className={`text-xs font-mono tabular-nums ${tier.color}`}>{pct}%</span>
    </div>
  );
}

function ModelCard({
  pred,
  onFavorite,
}: {
  pred: PredictionResult;
  onFavorite?: (pred: PredictionResult) => void;
}) {
  const isOracle = pred.modelName === "ai_oracle";
  const isCdm = pred.modelName === "cdm";
  const isChiSquare = pred.modelName === "chi_square";
  const isNew = isCdm || isChiSquare;
  const meta = pred.metadata as Record<string, unknown>;
  const isInsufficient = meta?.insufficient_data === true;
  const sumFilter = meta?.sumRangeFilter as Record<string, unknown> | undefined;
  const wasAdjusted = sumFilter?.wasAdjusted === true;

  return (
    <Card
      className={`bg-card border-border/50 transition-all ${
        isInsufficient
          ? "opacity-60 border-yellow-500/20"
          : isOracle
          ? "border-accent/40 glow-gold-sm"
          : isNew
          ? "border-blue-500/30 hover:border-blue-500/50"
          : "hover:border-primary/30"
      }`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row: model name + badges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOracle ? (
              <Sparkles className="w-4 h-4 text-accent" />
            ) : isNew ? (
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Target className="w-3.5 h-3.5 text-primary/60" />
            )}
            <span className="text-sm font-semibold">{getModelDisplayName(pred.modelName)}</span>
            {isNew && (
              <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-300 border-blue-500/30">
                NEW
              </Badge>
            )}
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
                    <p>
                      Original sum: {String(sumFilter?.originalSum)} → Adjusted:{" "}
                      {String(sumFilter?.adjustedSum)}
                    </p>
                    <p>
                      Acceptable range: [{String((sumFilter?.acceptableRange as number[])?.[0])}-
                      {String((sumFilter?.acceptableRange as number[])?.[1])}]
                    </p>
                    {(sumFilter?.notes as string[])?.map((n, i) => (
                      <p key={i} className="text-amber-300">
                        {n}
                      </p>
                    ))}
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
            <Badge
              variant="outline"
              className={`text-xs ${
                isInsufficient ? "border-yellow-500/40 text-yellow-400" : "border-border"
              }`}
            >
              {isInsufficient ? "needs data" : (meta?.strategy as string) || "model"}
            </Badge>
          </div>
        </div>

        {/* Numbers */}
        {isInsufficient ? (
          <div className="py-2 text-xs text-yellow-400/80 italic">
            {(meta?.message as string) || "Insufficient historical data for this model."}
          </div>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {pred.mainNumbers.map((n, i) => (
              <LottoBall key={i} number={n} />
            ))}
            {pred.specialNumbers.map((n, i) => (
              <LottoBall key={`s-${i}`} number={n} variant="special" />
            ))}
          </div>
        )}

        {/* Confidence */}
        <ConfidenceMeter score={pred.confidenceScore} />
      </CardContent>
    </Card>
  );
}

function TicketCard({
  ticket,
  index,
  onFavorite,
}: {
  ticket: TicketEntry;
  index: number;
  onFavorite?: (ticket: TicketEntry) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold tabular-nums">
        #{index + 1}
      </div>
      <div className="flex-1">
        <div className="flex gap-1.5 flex-wrap mb-1">
          {ticket.mainNumbers.map((n, i) => (
            <LottoBall key={i} number={n} />
          ))}
          {ticket.specialNumbers.map((n, i) => (
            <LottoBall key={`s-${i}`} number={n} variant="special" />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {getModelDisplayName(ticket.modelSource)} &middot;{" "}
          <span className="font-mono tabular-nums">{formatConfidence(ticket.confidence)}</span>{" "}
          confidence
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

function generatePrintableTickets(
  gameName: string,
  tickets: TicketEntry[],
  totalCost: number,
  budget: number
) {
  const rows = tickets
    .map(
      (t, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td>${t.mainNumbers.join(", ")}${t.specialNumbers.length ? " | " + t.specialNumbers.join(", ") : ""}</td>
        <td>${getModelDisplayName(t.modelSource)}</td>
        <td>${formatConfidence(t.confidence)}</td>
      </tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><title>${gameName} Tickets</title>
    <style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}</style></head>
    <body><h2>${gameName} — ${tickets.length} Tickets</h2>
    <p>Budget: $${budget} | Total cost: $${totalCost}</p>
    <table><thead><tr><th>#</th><th>Numbers</th><th>Model</th><th>Confidence</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  } else {
    toast.error("Pop-up blocked. Please allow pop-ups to print tickets.");
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PredictionsContent() {
  const { selectedGame } = useGame();
  const [sumRangeFilter, setSumRangeFilter] = useState(false);
  const { isAuthenticated } = useAuth();

  const generatePredictions = trpc.predictions.generate.useMutation();
  const generateTickets = trpc.tickets.generate.useMutation();
  const generateQuickPick = trpc.predictions.quickPick.useMutation();

  const { queuePrediction } = useBackgroundSync(
    useCallback(
      async (gameType: string) => {
        await generatePredictions.mutateAsync({
          gameType: gameType as GameType,
          sumRangeFilter,
        });
      },
      [generatePredictions, sumRangeFilter]
    )
  );

  const handleRunModels = useCallback(() => {
    if (queuePrediction(selectedGame)) return;
    generatePredictions.mutate({ gameType: selectedGame, sumRangeFilter });
  }, [selectedGame, sumRangeFilter, queuePrediction, generatePredictions]);

  const addFavorite = trpc.favorites.add.useMutation({
    onSuccess: () => toast.success("Saved to favorites!"),
    onError: () => toast.error("Failed to save. Please sign in first."),
  });

  const handleFavoritePred = useCallback(
    (pred: PredictionResult) => {
      if (!isAuthenticated) {
        toast.error("Sign in to save favorites");
        return;
      }
      addFavorite.mutate({
        gameType: selectedGame,
        mainNumbers: pred.mainNumbers,
        specialNumbers: pred.specialNumbers,
        modelSource: pred.modelName,
        confidence: pred.confidenceScore,
      });
    },
    [isAuthenticated, selectedGame, addFavorite]
  );

  const handleFavoriteTicket = useCallback(
    (ticket: TicketEntry) => {
      if (!isAuthenticated) {
        toast.error("Sign in to save favorites");
        return;
      }
      addFavorite.mutate({
        gameType: selectedGame,
        mainNumbers: ticket.mainNumbers,
        specialNumbers: ticket.specialNumbers,
        modelSource: ticket.modelSource,
        confidence: ticket.confidence,
      });
    },
    [isAuthenticated, selectedGame, addFavorite]
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
    if (!isAuthenticated) {
      toast.error("Sign in to log purchases");
      return;
    }
    if (!ticketData) return;
    const gameCfg = FLORIDA_GAMES[selectedGame];
    logBulk.mutate({
      tickets: (ticketData.tickets as TicketEntry[]).map((t) => ({
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
    <div className="space-y-4 pb-4">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={handleRunModels}
          disabled={generatePredictions.isPending}
          className="bg-primary text-primary-foreground"
          size="sm"
        >
          <Zap className="w-4 h-4 mr-1" />
          {generatePredictions.isPending ? "Running…" : "Run 18 Models"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            generateTickets.mutate({ gameType: selectedGame, budget: 75, maxTickets: 20 })
          }
          disabled={generateTickets.isPending}
          className="border-accent/50 text-accent hover:bg-accent/10"
        >
          <DollarSign className="w-4 h-4 mr-1" />
          {generateTickets.isPending ? "Selecting…" : "$75 Tickets"}
        </Button>
      </div>

      {/* Sum/Range Filter toggle */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
        <Filter className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Switch
              id="sum-filter"
              checked={sumRangeFilter}
              onCheckedChange={setSumRangeFilter}
            />
            <Label htmlFor="sum-filter" className="text-xs cursor-pointer">
              Sum/Range Constraint Filter
            </Label>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Adjusts predictions to fall within historically typical sum ranges
          </p>
        </div>
      </div>

      {/* Sum filter notice */}
      {generatePredictions.data?.sumRangeFilterApplied && (
        <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 flex-shrink-0" />
          Sum/Range Constraint Filter was applied. Models with adjusted numbers show a{" "}
          <Filter className="w-3 h-3 inline" /> icon.
        </div>
      )}

      {/* Results tabs */}
      <Tabs defaultValue="models" className="space-y-4">
        <TabsList className="bg-secondary w-full grid grid-cols-3">
          <TabsTrigger value="models" className="text-xs">18 Models</TabsTrigger>
          <TabsTrigger value="tickets" className="text-xs">Budget Tickets</TabsTrigger>
          <TabsTrigger value="quickpick" className="text-xs">vs Quick Pick</TabsTrigger>
        </TabsList>

        {/* Models tab */}
        <TabsContent value="models">
          {generatePredictions.isPending ? (
            <LoadingState rows={6} rowHeight="h-28" />
          ) : predictions ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Showing predictions for{" "}
                <span className="text-primary font-medium">
                  {generatePredictions.data?.gameName}
                </span>{" "}
                from all 18 models
              </p>
              <ConsensusPanel predictions={predictions} />
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {predictions.filter((p) => p.modelName === "ai_oracle").map((p) => (
                  <div key={p.modelName} className="sm:col-span-2">
                    <ModelCard pred={p} onFavorite={handleFavoritePred} />
                  </div>
                ))}
                {predictions
                  .filter((p) => p.modelName !== "ai_oracle")
                  .map((p) => (
                    <ModelCard key={p.modelName} pred={p} onFavorite={handleFavoritePred} />
                  ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Dices className="w-12 h-12" />}
              title="No predictions yet"
              description='Select a game and tap "Run 18 Models" to generate predictions'
            />
          )}
        </TabsContent>

        {/* Budget Tickets tab */}
        <TabsContent value="tickets">
          {generateTickets.isPending ? (
            <LoadingState rows={5} rowHeight="h-16" />
          ) : ticketData ? (
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  <span className="text-accent font-medium tabular-nums">
                    {ticketData.tickets.length} tickets
                  </span>{" "}
                  for{" "}
                  <span className="text-primary font-medium">{ticketData.gameName}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-accent/50 text-accent text-xs tabular-nums">
                    ${ticketData.totalCost} / $75 budget
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePrint}
                    className="border-primary/50 text-primary hover:bg-primary/10"
                  >
                    <Printer className="w-4 h-4 mr-1" />
                    Print
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLogPurchases}
                    disabled={logBulk.isPending}
                    className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                  >
                    <ShoppingCart className="w-4 h-4 mr-1" />
                    {logBulk.isPending ? "Logging…" : "Log"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {ticketData.tickets.map((t, i) => (
                  <TicketCard
                    key={i}
                    ticket={t as TicketEntry}
                    index={i}
                    onFavorite={handleFavoriteTicket}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<DollarSign className="w-12 h-12" />}
              title="No tickets generated"
              description='Tap "$75 Tickets" to generate 20 budget-optimized tickets'
            />
          )}
        </TabsContent>

        {/* Quick Pick comparison tab */}
        <TabsContent value="quickpick">
          <QuickPickComparison
            selectedGame={selectedGame}
            modelPredictions={predictions || null}
            quickPickData={generateQuickPick.data || null}
            onRunModels={() =>
              generatePredictions.mutate({ gameType: selectedGame, sumRangeFilter })
            }
            onGenerateQuickPick={() =>
              generateQuickPick.mutate({ gameType: selectedGame, count: 5 })
            }
            isRunningModels={generatePredictions.isPending}
            isGeneratingQP={generateQuickPick.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── QuickPickComparison (inline, unchanged from original) ────────────────────

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
  quickPickData: { picks: Array<{ mainNumbers: number[]; specialNumbers: number[] }> } | null;
  onRunModels: () => void;
  onGenerateQuickPick: () => void;
  isRunningModels: boolean;
  isGeneratingQP: boolean;
}) {
  const topModels = modelPredictions
    ? [...modelPredictions]
        .filter((p) => !(p.metadata as Record<string, unknown>)?.insufficient_data)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="bg-primary text-primary-foreground"
          onClick={() => {
            onRunModels();
            onGenerateQuickPick();
          }}
          disabled={isRunningModels || isGeneratingQP}
        >
          <Shuffle className="w-4 h-4 mr-1" />
          {isRunningModels || isGeneratingQP ? "Generating…" : "Generate Both"}
        </Button>
      </div>

      {!topModels.length && !quickPickData ? (
        <EmptyState
          icon={<ArrowLeftRight className="w-12 h-12" />}
          title="Nothing to compare yet"
          description='Tap "Generate Both" to compare formula predictions against random Quick Picks'
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Formula Picks */}
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
                  <div
                    key={pred.modelName}
                    className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold tabular-nums">
                      #{i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-1.5 flex-wrap mb-1">
                        {pred.mainNumbers.map((n, j) => (
                          <LottoBall key={j} number={n} />
                        ))}
                        {pred.specialNumbers.map((n, j) => (
                          <LottoBall key={`s-${j}`} number={n} variant="special" />
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {getModelDisplayName(pred.modelName)} ·{" "}
                        <span className="font-mono tabular-nums">
                          {formatConfidence(pred.confidenceScore)}
                        </span>{" "}
                        confidence
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg border border-border/30">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Run models first to see formula picks</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRunModels}
                  disabled={isRunningModels}
                  className="mt-2"
                >
                  {isRunningModels ? "Running…" : "Run Models"}
                </Button>
              </div>
            )}
          </div>

          {/* Quick Picks */}
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
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20"
                  >
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold tabular-nums">
                      #{i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex gap-1.5 flex-wrap mb-1">
                        {pick.mainNumbers.map((n, j) => (
                          <span
                            key={j}
                            className="lotto-ball"
                            style={{
                              background: "linear-gradient(135deg, #f97316, #ea580c)",
                              color: "#000",
                            }}
                          >
                            {n}
                          </span>
                        ))}
                        {pick.specialNumbers.map((n, j) => (
                          <span key={`s-${j}`} className="lotto-ball lotto-ball-special">
                            {n}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Random Quick Pick</p>
                    </div>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onGenerateQuickPick}
                  disabled={isGeneratingQP}
                  className="w-full mt-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                >
                  <Shuffle className="w-3.5 h-3.5 mr-1" />
                  {isGeneratingQP ? "Generating…" : "Re-Roll Quick Picks"}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg border border-border/30">
                <Shuffle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Click "Generate Both" to see quick picks</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
