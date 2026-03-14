import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, type PredictionResult } from "@shared/lottery";
import { Zap, DollarSign, Dices, Target, Sparkles } from "lucide-react";
import { useState, useMemo } from "react";

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Prediction Engine</h1>
            <p className="text-sm text-muted-foreground mt-1">Run all 16 models or generate budget-optimized tickets</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
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
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="text-accent font-medium">{ticketData.tickets.length} tickets</span> for{" "}
                    <span className="text-primary font-medium">{ticketData.gameName}</span>
                  </p>
                  <Badge variant="outline" className="border-accent/50 text-accent">
                    Total: ${ticketData.totalCost} / ${75} budget
                  </Badge>
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
