import { useAuth } from "@/_core/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getLoginUrl } from "@/const";
import { Shield, Plus, Download, Database, Trophy, LogIn, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

function AddDrawForm() {
  const [gameType, setGameType] = useState<GameType>("fantasy_5");
  const [drawDate, setDrawDate] = useState("");
  const [mainNumbers, setMainNumbers] = useState("");
  const [specialNumbers, setSpecialNumbers] = useState("");
  const [drawTime, setDrawTime] = useState("evening");
  const addDraw = trpc.draws.add.useMutation();
  const utils = trpc.useUtils();

  const gameCfg = FLORIDA_GAMES[gameType];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mainNums = mainNumbers.split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    const specialNums = specialNumbers ? specialNumbers.split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n)) : [];

    if (mainNums.length !== gameCfg.mainCount) {
      toast.error(`${gameCfg.name} requires exactly ${gameCfg.mainCount} main numbers`);
      return;
    }
    if (gameCfg.specialCount > 0 && specialNums.length !== gameCfg.specialCount) {
      toast.error(`${gameCfg.name} requires exactly ${gameCfg.specialCount} special number(s)`);
      return;
    }

    addDraw.mutate({
      gameType,
      drawDate: new Date(drawDate).getTime(),
      mainNumbers: mainNums,
      specialNumbers: specialNums,
      drawTime,
    }, {
      onSuccess: () => {
        toast.success("Draw result added successfully");
        setMainNumbers("");
        setSpecialNumbers("");
        setDrawDate("");
        utils.draws.latest.invalidate();
        utils.draws.all.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary" />
          Add Draw Result
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Game Type</Label>
              <Select value={gameType} onValueChange={(v) => setGameType(v as GameType)}>
                <SelectTrigger className="bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gameOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Draw Date</Label>
              <Input type="date" value={drawDate} onChange={e => setDrawDate(e.target.value)} className="bg-input" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Main Numbers ({gameCfg.mainCount} numbers, 1-{gameCfg.mainMax}, comma-separated)</Label>
            <Input
              value={mainNumbers}
              onChange={e => setMainNumbers(e.target.value)}
              placeholder={`e.g. ${Array.from({length: gameCfg.mainCount}, (_, i) => i + 1).join(", ")}`}
              className="bg-input"
              required
            />
          </div>

          {gameCfg.specialCount > 0 && (
            <div className="space-y-2">
              <Label>Special Number(s) ({gameCfg.specialCount}, 1-{gameCfg.specialMax})</Label>
              <Input
                value={specialNumbers}
                onChange={e => setSpecialNumbers(e.target.value)}
                placeholder="e.g. 5"
                className="bg-input"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Draw Time</Label>
            <Select value={drawTime} onValueChange={setDrawTime}>
              <SelectTrigger className="bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evening">Evening</SelectItem>
                <SelectItem value="midday">Midday</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={addDraw.isPending} className="bg-primary text-primary-foreground">
            {addDraw.isPending ? "Adding..." : "Add Draw Result"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FetchDataSection() {
  const [gameType, setGameType] = useState<GameType>("fantasy_5");
  const fetchLatest = trpc.dataFetch.fetchLatest.useMutation();
  const fetchAll = trpc.dataFetch.fetchAll.useMutation();
  const utils = trpc.useUtils();

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const handleFetchSingle = () => {
    fetchLatest.mutate({ gameType }, {
      onSuccess: (data) => {
        if (data.success) {
          toast.success(`Fetched ${data.insertedCount} new draw(s) for ${FLORIDA_GAMES[gameType].name}`);
          utils.draws.latest.invalidate();
          utils.draws.all.invalidate();
        } else {
          toast.error("Failed to fetch results");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleFetchAll = () => {
    fetchAll.mutate(undefined, {
      onSuccess: (data) => {
        if (data.success) {
          const totalInserted = Object.values(data.results).reduce((sum, r) => sum + r.count, 0);
          const gamesSummary = Object.entries(data.results)
            .filter(([_, r]) => r.count > 0)
            .map(([gt, r]) => `${FLORIDA_GAMES[gt as GameType]?.name || gt}: ${r.count}`)
            .join(", ");
          toast.success(`Fetched ${totalInserted} draw(s) from floridalottery.com${gamesSummary ? ` (${gamesSummary})` : ""}`);
          utils.draws.latest.invalidate();
          utils.draws.all.invalidate();
        } else {
          toast.error("Failed to fetch results");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const isFetching = fetchLatest.isPending || fetchAll.isPending;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="w-5 h-5 text-accent" />
          Auto-Fetch Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Fetch the latest Florida Lottery results directly from <span className="text-primary">floridalottery.com</span>. Results are automatically saved to the database.
        </p>

        {/* Fetch All Games */}
        <Button
          onClick={handleFetchAll}
          disabled={isFetching}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          size="lg"
        >
          {fetchAll.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Fetching All Games...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Fetch All Games (Latest Results)
            </>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or fetch single game</span>
          </div>
        </div>

        {/* Fetch Single Game */}
        <div className="flex gap-3">
          <Select value={gameType} onValueChange={(v) => setGameType(v as GameType)}>
            <SelectTrigger className="w-[180px] bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gameOptions.map(g => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleFetchSingle} disabled={isFetching} variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
            <Download className="w-4 h-4 mr-1" />
            {fetchLatest.isPending ? "Fetching..." : "Fetch"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AllDrawResults() {
  const { data, isLoading } = trpc.draws.all.useQuery({ limit: 100 });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No draw results in the database yet.</p>
        <p className="text-xs mt-1">Use "Fetch All Games" above to pull the latest results.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Game</th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Date</th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Numbers</th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {data.map((draw) => {
            const mainNums = draw.mainNumbers as number[];
            const specialNums = draw.specialNumbers as number[] | null;
            const gameCfg = FLORIDA_GAMES[draw.gameType as GameType];
            return (
              <tr key={draw.id} className="border-b border-border/30">
                <td className="py-2 px-3">
                  <Badge variant="outline" className="text-xs">{gameCfg?.name || draw.gameType}</Badge>
                </td>
                <td className="py-2 px-3 text-muted-foreground text-xs">{new Date(draw.drawDate).toLocaleDateString()}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-1 flex-wrap">
                    {mainNums.map((n, i) => (
                      <span key={i} className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">{n}</span>
                    ))}
                    {specialNums && specialNums.length > 0 && specialNums.map((n, i) => (
                      <span key={`s-${i}`} className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold">{n}</span>
                    ))}
                  </div>
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{draw.source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          {!user ? (
            <>
              <LogIn className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
              <h2 className="text-xl font-semibold mb-2">Sign in required</h2>
              <p className="text-sm text-muted-foreground mb-6">Admin access is required to manage draw results.</p>
              <Button asChild className="bg-primary text-primary-foreground">
                <a href={getLoginUrl()}>Sign In</a>
              </Button>
            </>
          ) : (
            <>
              <Shield className="w-12 h-12 mx-auto mb-4 text-destructive opacity-40" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-sm text-muted-foreground">You need admin privileges to access this page.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Shield className="w-6 h-6 text-accent" />
          Admin Panel
        </h1>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <AddDrawForm />
          <FetchDataSection />
        </div>

        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              All Draw Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AllDrawResults />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
