/**
 * FavoritesContent — the Favorites sub-tab within GenerateTab.
 *
 * Reads selectedGame from GameContext as the default filter.
 * Removes Navbar and standalone page wrapper.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { Heart, Trash2, Copy, Star, LogIn } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { useGame } from "@/contexts/GameContext";
import { LoadingState, EmptyState } from "@/components/StateViews";

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

export default function FavoritesContent() {
  const { selectedGame } = useGame();
  const { isAuthenticated } = useAuth();
  const [filterGame, setFilterGame] = useState<string>(selectedGame);
  const utils = trpc.useUtils();

  const { data: favorites, isLoading } = trpc.favorites.list.useQuery(
    filterGame !== "all" ? { gameType: filterGame as GameType } : undefined,
    { enabled: isAuthenticated }
  );

  const removeMutation = trpc.favorites.remove.useMutation({
    onSuccess: () => {
      utils.favorites.list.invalidate();
      toast.success("Removed from favorites");
    },
  });

  const useMutation = trpc.favorites.use.useMutation({
    onSuccess: () => {
      utils.favorites.list.invalidate();
    },
  });

  const gameOptions = useMemo(
    () => [
      { id: "all", name: "All Games" },
      ...GAME_TYPES.map((id) => ({ id, name: FLORIDA_GAMES[id].name })),
    ],
    []
  );

  const handleCopyNumbers = (mainNumbers: number[], specialNumbers: number[] | null) => {
    const nums = [...(mainNumbers || [])];
    if (specialNumbers && specialNumbers.length > 0) {
      nums.push(...specialNumbers);
    }
    navigator.clipboard.writeText(nums.join(", "));
    toast.success("Numbers copied to clipboard");
  };

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <LogIn className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h2 className="text-lg font-semibold mb-2">Sign in to view favorites</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Save your best picks and access them anytime.
        </p>
        <Button asChild className="bg-primary text-primary-foreground">
          <a href={getLoginUrl()}>Sign In</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Filter */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Saved number combinations</p>
        <Select value={filterGame} onValueChange={setFilterGame}>
          <SelectTrigger className="w-[160px] bg-card h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {gameOptions.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* States */}
      {isLoading && <LoadingState rows={4} rowHeight="h-28" />}

      {!isLoading && favorites && favorites.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {favorites.map((fav) => {
            const mainNums = fav.mainNumbers as number[];
            const specialNums = (fav.specialNumbers as number[]) || [];
            const gameName = FLORIDA_GAMES[fav.gameType as GameType]?.name || fav.gameType;
            return (
              <Card
                key={fav.id}
                className="bg-card border-border/50 hover:border-primary/30 transition-all"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-accent" />
                      <span className="text-sm font-semibold">{fav.label || gameName}</span>
                    </div>
                    <Badge variant="outline" className="text-xs border-border">
                      {gameName}
                    </Badge>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {mainNums.map((n, i) => (
                      <LottoBall key={i} number={n} />
                    ))}
                    {specialNums.map((n, i) => (
                      <LottoBall key={`s-${i}`} number={n} variant="special" />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      {fav.modelSource && (
                        <span>{fav.modelSource.replace(/_/g, " ")}</span>
                      )}
                      {fav.confidence != null && (
                        <span className="tabular-nums font-mono">
                          {Math.round(fav.confidence * 100)}% conf.
                        </span>
                      )}
                    </div>
                    <span className="tabular-nums">Used {fav.usageCount}×</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => {
                        useMutation.mutate({ id: fav.id });
                        handleCopyNumbers(mainNums, specialNums);
                      }}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copy & Use
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => removeMutation.mutate({ id: fav.id })}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Saved {new Date(fav.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && (!favorites || favorites.length === 0) && (
        <EmptyState
          icon={<Heart className="w-12 h-12" />}
          title="No favorites saved yet"
          description="Run models in the Analyze tab and tap the heart icon on any prediction to save it here."
        />
      )}
    </div>
  );
}
