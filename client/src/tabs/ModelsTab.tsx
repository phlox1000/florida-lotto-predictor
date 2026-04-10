/**
 * ModelsTab — the Models tab screen.
 *
 * Composition:
 *   Sub-tabs: Leaderboard | Compare | Head-to-Head
 *
 * No game selector at the tab level — each sub-section has its own context.
 * Removes Navbar and standalone page wrappers.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, ArrowLeftRight, Swords } from "lucide-react";
import { Suspense, lazy } from "react";
import { LoadingState } from "@/components/StateViews";

const LeaderboardContent = lazy(() => import("@/tabs/models/LeaderboardContent"));
const CompareContent = lazy(() => import("@/tabs/models/CompareContent"));
const HeadToHeadContent = lazy(() => import("@/tabs/models/HeadToHeadContent"));

export default function ModelsTab() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <h2 className="text-base font-bold">Model Analytics</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pt-4">
        <Tabs defaultValue="leaderboard" className="space-y-4">
          <TabsList className="bg-secondary w-full grid grid-cols-3">
            <TabsTrigger value="leaderboard" className="flex items-center gap-1.5 text-xs">
              <Trophy className="w-3.5 h-3.5" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="compare" className="flex items-center gap-1.5 text-xs">
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Compare
            </TabsTrigger>
            <TabsTrigger value="h2h" className="flex items-center gap-1.5 text-xs">
              <Swords className="w-3.5 h-3.5" />
              Head-to-Head
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <Suspense fallback={<LoadingState rows={8} />}>
              <LeaderboardContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="compare">
            <Suspense fallback={<LoadingState rows={4} />}>
              <CompareContent />
            </Suspense>
          </TabsContent>

          <TabsContent value="h2h">
            <Suspense fallback={<LoadingState rows={4} />}>
              <HeadToHeadContent />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
