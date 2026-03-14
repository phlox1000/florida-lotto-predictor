import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { Zap, TrendingUp, Brain, Trophy, ArrowRight, Sparkles, Clock, Timer, AlertCircle } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

function DrawScheduleCountdown() {
  const { data, isLoading } = trpc.schedule.all.useQuery(undefined, {
    refetchInterval: 60000, // refresh every minute
  });
  const [, setTick] = useState(0);

  // Re-render every 30s to update countdowns
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (!data) return null;

  // Filter to active games with upcoming draws, sorted by next draw time
  const activeGames = data
    .filter(g => !g.schedule.ended && g.nextDraw)
    .sort((a, b) => new Date(a.nextDraw!).getTime() - new Date(b.nextDraw!).getTime());

  const endedGames = data.filter(g => g.schedule.ended);

  // Recalculate countdown live
  const getCountdown = (nextDrawIso: string) => {
    const target = new Date(nextDrawIso);
    const now = new Date();
    const etOffset = -5;
    const etNow = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
    const diff = target.getTime() - etNow.getTime();
    if (diff <= 0) return "Drawing now!";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {activeGames.map(g => {
          const isToday = g.nextDraw && new Date(g.nextDraw).toDateString() === new Date().toDateString();
          return (
            <Card key={g.gameType} className={`bg-card border-border/50 ${isToday ? "border-primary/40 glow-cyan-sm" : ""}`}>
              <CardContent className="p-3 text-center">
                <p className="text-xs font-medium text-muted-foreground mb-1">{g.gameName}</p>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Timer className={`w-3.5 h-3.5 ${isToday ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                  <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {g.nextDraw ? getCountdown(g.nextDraw) : "—"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{g.schedule.description}</p>
                {isToday && <Badge variant="outline" className="text-[9px] mt-1 border-primary/30 text-primary">Today</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {endedGames.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {endedGames.map(g => (
            <Badge key={g.gameType} variant="outline" className="text-[10px] text-muted-foreground border-border/50">
              <AlertCircle className="w-2.5 h-2.5 mr-1" />
              {g.gameName}: {g.countdown}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function LatestResults() {
  const { data, isLoading } = trpc.draws.latest.useQuery({ limit: 6 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Trophy className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No draw results yet. Add results via the Admin panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((draw) => {
        const mainNums = draw.mainNumbers as number[];
        const specialNums = draw.specialNumbers as number[] | null;
        const gameCfg = FLORIDA_GAMES[draw.gameType as GameType];
        return (
          <div key={draw.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {gameCfg?.name || draw.gameType} &middot; {new Date(draw.drawDate).toLocaleDateString()}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {mainNums.map((n, i) => <LottoBall key={i} number={n} />)}
                {specialNums && specialNums.length > 0 && specialNums.map((n, i) => (
                  <LottoBall key={`s-${i}`} number={n} variant="special" />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const generatePredictions = trpc.predictions.generate.useMutation();
  const generateTickets = trpc.tickets.generate.useMutation();

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const handlePredict = () => {
    generatePredictions.mutate({ gameType: selectedGame }, {
      onSuccess: () => navigate("/predictions"),
    });
  };

  const handleBudgetTickets = () => {
    generateTickets.mutate({ gameType: selectedGame, budget: 75, maxTickets: 20 }, {
      onSuccess: () => navigate("/predictions"),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-48 h-48 bg-accent/5 rounded-full blur-3xl" />

        <div className="container relative pt-16 pb-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              16 Prediction Models &middot; AI-Powered Analysis
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              Florida Lotto{" "}
              <span className="text-primary text-glow-cyan">Oracle</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
              Quantum-inspired prediction engine combining 16 statistical models with AI ensemble analysis.
              Generate optimized ticket selections powered by data-driven analysis.
            </p>

            {/* Game Selector + Actions */}
            <div className="max-w-md mx-auto space-y-4">
              <Select value={selectedGame} onValueChange={(v) => setSelectedGame(v as GameType)}>
                <SelectTrigger className="h-12 text-base bg-card border-border">
                  <SelectValue placeholder="Select a game" />
                </SelectTrigger>
                <SelectContent>
                  {gameOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-3">
                <Button
                  size="lg"
                  className="flex-1 h-12 bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan-sm"
                  onClick={handlePredict}
                  disabled={generatePredictions.isPending}
                >
                  {generatePredictions.isPending ? (
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 animate-spin" /> Generating...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4" /> Get Predictions
                    </span>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 h-12 border-accent/50 text-accent hover:bg-accent/10"
                  onClick={handleBudgetTickets}
                  disabled={generateTickets.isPending}
                >
                  {generateTickets.isPending ? (
                    <span className="flex items-center gap-2">
                      Selecting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      20 Tickets / $75
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Draw Schedule Countdown */}
      <section className="container pb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Next Draws
        </h2>
        <DrawScheduleCountdown />
      </section>

      {/* Features + Latest Results */}
      <section className="container pb-16">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Feature Cards */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              How It Works
            </h2>
            {[
              { icon: TrendingUp, title: "16 Statistical Models", desc: "From Poisson distributions to Markov chains, quantum-inspired algorithms, and Bayesian inference." },
              { icon: Brain, title: "AI Oracle Ensemble", desc: "Meta-model that watches all 15 siblings, auto-weights by historical accuracy, and outputs optimized consensus." },
              { icon: Sparkles, title: "LLM-Powered Analysis", desc: "Natural language explanations of patterns, model performance, and personalized strategy recommendations." },
            ].map((f, i) => (
              <Card key={i} className="bg-card border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="flex gap-4 p-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button variant="ghost" className="text-primary" onClick={() => navigate("/analysis")}>
              Explore AI Analysis <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {/* Latest Results */}
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Latest Draw Results
            </h2>
            <Card className="bg-card border-border/50">
              <CardContent className="p-4">
                <LatestResults />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="container text-center text-xs text-muted-foreground">
          <p>Florida Lotto Oracle &middot; For entertainment purposes only. Lottery outcomes are random.</p>
          <p className="mt-1">No prediction system can guarantee wins. Please play responsibly.</p>
        </div>
      </footer>
    </div>
  );
}
