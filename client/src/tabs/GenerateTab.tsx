/**
 * GenerateTab — the Generate tab screen.
 *
 * Composition:
 *   GameContextBar (shared game selector + countdown)
 *   ↓
 *   Sub-tabs: Smart Wheel | Number Wheel | Favorites
 *
 * Reads selectedGame from GameContext.
 */
import GameContextBar from "@/components/GameContextBar";
import { useGame } from "@/contexts/GameContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Cog, Heart } from "lucide-react";
import { Suspense, lazy } from "react";
import { LoadingState } from "@/components/StateViews";

const WheelContent = lazy(() => import("@/tabs/generate/WheelContent"));
const FavoritesContent = lazy(() => import("@/tabs/generate/FavoritesContent"));

export default function GenerateTab() {
  const { gameCfg } = useGame();

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky game context bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/50 px-4">
        <GameContextBar />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4">
        <Tabs defaultValue="wheel" className="space-y-4">
          <TabsList className="bg-secondary w-full grid grid-cols-2">
            <TabsTrigger value="wheel" className="flex items-center gap-1.5 text-xs">
              <Cog className="w-3.5 h-3.5" />
              Number Wheel
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-1.5 text-xs">
              <Heart className="w-3.5 h-3.5" />
              Favorites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wheel">
            <Suspense fallback={<LoadingState rows={4} />}>
              <WheelContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="favorites">
            <Suspense fallback={<LoadingState rows={4} />}>
              <FavoritesContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
