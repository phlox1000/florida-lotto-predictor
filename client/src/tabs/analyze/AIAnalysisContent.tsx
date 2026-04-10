/**
 * AIAnalysisContent — the AI Analysis sub-tab within AnalyzeTab.
 *
 * Reads selectedGame from GameContext.
 * Delegates all LLM streaming logic to the existing Analysis page internals.
 * Removes the page-level Navbar and game selector.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useGame } from "@/contexts/GameContext";
import { LoadingState } from "@/components/StateViews";

export default function AIAnalysisContent() {
  const { selectedGame, gameCfg } = useGame();
  const [analysisText, setAnalysisText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analysisMutation = trpc.analysis.generate.useMutation({
    onMutate: () => {
      setAnalysisText("");
      setError(null);
      setIsStreaming(true);
    },
    onSuccess: (data) => {
      setAnalysisText(data.analysis || "");
      setIsStreaming(false);
    },
    onError: (err) => {
      setError(err.message || "Failed to generate analysis.");
      setIsStreaming(false);
    },
  });

  // Abort on game change
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [selectedGame]);

  const handleGenerate = () => {
    analysisMutation.mutate({ gameType: selectedGame, analysisType: "strategy_recommendation" });
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center glow-gold-sm">
            <Brain className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Analysis</h3>
            <p className="text-[10px] text-muted-foreground">
              Powered by GPT-4 · {gameCfg.name}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={isStreaming}
          className="bg-accent/20 text-accent hover:bg-accent/30 border border-accent/40"
          variant="outline"
        >
          {isStreaming ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              {analysisText ? "Regenerate" : "Generate Analysis"}
            </>
          )}
        </Button>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>
          AI analysis is for informational purposes only. Lottery outcomes are random and past
          patterns do not guarantee future results.
        </p>
      </div>

      {/* Loading skeleton */}
      {isStreaming && !analysisText && <LoadingState rows={5} />}

      {/* Error */}
      {error && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 text-red-400 text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Analysis output */}
      {analysisText && (
        <Card className="border-accent/20 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Analysis for {gameCfg.name}
              <Badge className="bg-accent/20 text-accent text-[10px] ml-auto">AI Oracle</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {analysisText}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isStreaming && !analysisText && !error && (
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-8 text-center">
            <Brain className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              Tap "Generate Analysis" to get an AI-powered breakdown of{" "}
              <span className="text-primary font-medium">{gameCfg.name}</span> patterns,
              trends, and model consensus.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
