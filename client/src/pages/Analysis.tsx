import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { Brain, TrendingUp, Search, Lightbulb } from "lucide-react";
import { useState, useMemo } from "react";
import { Streamdown } from "streamdown";

const analysisTypes = [
  { id: "model_performance" as const, label: "Model Performance", icon: TrendingUp, desc: "Which models performed best and why" },
  { id: "pattern_analysis" as const, label: "Pattern Analysis", icon: Search, desc: "Hot/cold numbers, gaps, and distributions" },
  { id: "strategy_recommendation" as const, label: "Strategy Tips", icon: Lightbulb, desc: "Personalized betting strategy recommendations" },
];

export default function Analysis() {
  const [selectedGame, setSelectedGame] = useState<GameType>("fantasy_5");
  const [activeType, setActiveType] = useState<"model_performance" | "pattern_analysis" | "strategy_recommendation">("model_performance");
  const generateAnalysis = trpc.analysis.generate.useMutation();
  const { data: perfStats, isLoading: perfLoading } = trpc.performance.stats.useQuery({ gameType: selectedGame });

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const handleAnalyze = () => {
    generateAnalysis.mutate({ gameType: selectedGame, analysisType: activeType });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="w-6 h-6 text-primary" />
              AI Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-1">LLM-powered insights into patterns, performance, and strategy</p>
          </div>
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
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {analysisTypes.map(at => (
            <Card
              key={at.id}
              className={`cursor-pointer transition-all ${
                activeType === at.id
                  ? "border-primary/50 bg-primary/5 glow-cyan-sm"
                  : "bg-card border-border/50 hover:border-primary/30"
              }`}
              onClick={() => setActiveType(at.id)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  activeType === at.id ? "bg-primary/20" : "bg-secondary"
                }`}>
                  <at.icon className={`w-5 h-5 ${activeType === at.id ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{at.label}</h3>
                  <p className="text-xs text-muted-foreground">{at.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          onClick={handleAnalyze}
          disabled={generateAnalysis.isPending}
          className="mb-8 bg-primary text-primary-foreground"
        >
          <Brain className="w-4 h-4 mr-2" />
          {generateAnalysis.isPending ? "Analyzing..." : "Generate Analysis"}
        </Button>

        {/* Analysis Result */}
        {generateAnalysis.data && (
          <Card className="bg-card border-border/50 mb-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                {analysisTypes.find(a => a.id === generateAnalysis.data.analysisType)?.label || "Analysis"}
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  {FLORIDA_GAMES[generateAnalysis.data.gameType as GameType]?.name}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-sm max-w-none">
              <Streamdown>{generateAnalysis.data.analysis}</Streamdown>
            </CardContent>
          </Card>
        )}

        {generateAnalysis.isPending && (
          <Card className="bg-card border-border/50 mb-8">
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        )}

        {/* Model Performance Stats */}
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Model Performance Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            {perfLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : perfStats && perfStats.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Model</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Predictions</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg Hits</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Max Hits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfStats.map((s) => (
                      <tr key={s.modelName} className="border-b border-border/30">
                        <td className="py-2 px-3 font-medium">{s.modelName.replace(/_/g, " ")}</td>
                        <td className="text-right py-2 px-3 text-muted-foreground">{s.totalPredictions}</td>
                        <td className="text-right py-2 px-3 text-primary">{Number(s.avgMainHits).toFixed(1)}</td>
                        <td className="text-right py-2 px-3 text-accent">{s.maxMainHits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                No performance data yet. Add draw results and generate predictions to build stats.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
