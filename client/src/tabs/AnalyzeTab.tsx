/**
 * AnalyzeTab — the Analyze tab screen.
 *
 * Composition:
 *   GameContextBar (shared game selector + countdown)
 *   ↓
 *   Sub-tabs: Predictions | Patterns | AI Analysis
 *
 * All heavy logic lives in the existing page components.
 * This file is a thin layout + GameContext wiring layer.
 */
import GameContextBar from "@/components/GameContextBar";
import { useGame } from "@/contexts/GameContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Brain, Zap } from "lucide-react";
import { Suspense, lazy } from "react";
import { LoadingState } from "@/components/StateViews";

// Lazy-load the heavy page components so the tab shell loads instantly
const PredictionsContent = lazy(() => import("@/tabs/analyze/PredictionsContent"));
const PatternsContent = lazy(() => import("@/tabs/analyze/PatternsContent"));
const AIAnalysisContent = lazy(() => import("@/tabs/analyze/AIAnalysisContent"));

export default function AnalyzeTab() {
  const { gameCfg } = useGame();

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky game context bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/50 px-4">
        <GameContextBar />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4">
        <Tabs defaultValue="predictions" className="space-y-4">
          <TabsList className="bg-secondary w-full grid grid-cols-3">
            <TabsTrigger value="predictions" className="flex items-center gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5" />
              Predictions
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex items-center gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" />
              Patterns
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-1.5 text-xs">
              <Brain className="w-3.5 h-3.5" />
              AI Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="predictions">
            <Suspense fallback={<LoadingState rows={6} />}>
              <PredictionsContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="patterns">
            <Suspense fallback={<LoadingState rows={4} />}>
              <PatternsContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="ai">
            <Suspense fallback={<LoadingState rows={3} />}>
              <AIAnalysisContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
