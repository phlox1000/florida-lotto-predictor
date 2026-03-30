import Navbar from "@/components/Navbar";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { Heart, Trash2, Copy, Star, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { AuthLoginLink } from "@/components/AuthLoginLink";

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

export default function Favorites() {
  const { user, isAuthenticated } = useAuth();
  const [filterGame, setFilterGame] = useState<string>("all");
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
    () => [{ id: "all", name: "All Games" }, ...GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name }))],
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
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <Heart className="w-16 h-16 mx-auto mb-4 text-primary/30" />
          <h1 className="text-2xl font-bold mb-2">Favorites</h1>
          <p className="text-muted-foreground mb-6">Sign in to save and manage your favorite number combinations.</p>
          <Button asChild className="bg-primary text-primary-foreground">
            <AuthLoginLink>Sign In</AuthLoginLink>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Heart className="w-6 h-6 text-primary" />
              My Favorites
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Saved number combinations for quick re-use
            </p>
          </div>
          <Select value={filterGame} onValueChange={setFilterGame}>
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

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : favorites && favorites.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favorites.map((fav) => {
              const mainNums = fav.mainNumbers as number[];
              const specialNums = (fav.specialNumbers as number[]) || [];
              const gameName = FLORIDA_GAMES[fav.gameType as GameType]?.name || fav.gameType;

              return (
                <Card key={fav.id} className="bg-card border-border/50 hover:border-primary/30 transition-all">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-accent" />
                        <span className="text-sm font-semibold">
                          {fav.label || gameName}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs border-border">
                        {gameName}
                      </Badge>
                    </div>

                    <div className="flex gap-1.5 flex-wrap">
                      {mainNums.map((n, i) => <LottoBall key={i} number={n} />)}
                      {specialNums.map((n, i) => <LottoBall key={`s-${i}`} number={n} variant="special" />)}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-3">
                        {fav.modelSource && (
                          <span>Model: {fav.modelSource.replace(/_/g, " ")}</span>
                        )}
                        {fav.confidence != null && (
                          <span>{Math.round(fav.confidence * 100)}% conf.</span>
                        )}
                      </div>
                      <span>Used {fav.usageCount}x</span>
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
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Heart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="mb-2">No favorites saved yet.</p>
            <p className="text-xs">
              Go to the Predictions page, run models, and click the heart icon on any prediction to save it here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
