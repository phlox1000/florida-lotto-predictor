import { useAuth } from "@/_core/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getLoginUrl } from "@/const";
import { Shield, Plus, Download, Database, Trophy, LogIn, RefreshCw, History, BarChart3, Activity, Upload, FileText, CheckCircle, XCircle, Loader2, Clock, Zap, Timer } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";

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
        toast.success("Draw result added & predictions auto-evaluated");
        setMainNumbers("");
        setSpecialNumbers("");
        setDrawDate("");
        utils.draws.latest.invalidate();
        utils.draws.all.invalidate();
        utils.schedule.dataHealth.invalidate();
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
                <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gameOptions.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Draw Date</Label>
              <Input type="date" value={drawDate} onChange={e => setDrawDate(e.target.value)} className="bg-input" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Main Numbers ({gameCfg.mainCount} numbers, {gameCfg.isDigitGame ? "0-9" : `1-${gameCfg.mainMax}`}, comma-separated)</Label>
            <Input value={mainNumbers} onChange={e => setMainNumbers(e.target.value)}
              placeholder={`e.g. ${Array.from({length: gameCfg.mainCount}, (_, i) => i + 1).join(", ")}`}
              className="bg-input" required />
          </div>
          {gameCfg.specialCount > 0 && (
            <div className="space-y-2">
              <Label>Special Number(s) ({gameCfg.specialCount}, 1-{gameCfg.specialMax})</Label>
              <Input value={specialNumbers} onChange={e => setSpecialNumbers(e.target.value)} placeholder="e.g. 5" className="bg-input" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Draw Time</Label>
            <Select value={drawTime} onValueChange={setDrawTime}>
              <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
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
  const fetchHistory = trpc.dataFetch.fetchHistory.useMutation();
  const utils = trpc.useUtils();

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const isFetching = fetchLatest.isPending || fetchAll.isPending || fetchHistory.isPending;

  const handleFetchAll = () => {
    fetchAll.mutate(undefined, {
      onSuccess: (data) => {
        if (data.success) {
          const totalInserted = Object.values(data.results).reduce((sum, r) => sum + r.count, 0);
          toast.success(`Fetched ${totalInserted} draw(s). Predictions auto-evaluated.`);
          utils.draws.latest.invalidate();
          utils.draws.all.invalidate();
          utils.schedule.dataHealth.invalidate();
          utils.performance.stats.invalidate();
        } else {
          toast.error("Failed to fetch results");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleFetchSingle = () => {
    fetchLatest.mutate({ gameType }, {
      onSuccess: (data) => {
        if (data.success) {
          toast.success(`Fetched ${data.insertedCount} new draw(s) for ${FLORIDA_GAMES[gameType].name}`);
          utils.draws.latest.invalidate();
          utils.draws.all.invalidate();
          utils.schedule.dataHealth.invalidate();
        } else {
          toast.error("Failed to fetch results");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleFetchHistory = () => {
    fetchHistory.mutate({ gameType, drawCount: 500 }, {
      onSuccess: (data) => {
        if (data.success) {
          toast.success(`Loaded ${data.insertedCount} historical draws for ${FLORIDA_GAMES[gameType].name} (${data.skippedCount} duplicates skipped)`);
          utils.draws.latest.invalidate();
          utils.draws.all.invalidate();
          utils.schedule.dataHealth.invalidate();
        } else {
          toast.error("Failed to fetch historical data");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

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
          Fetch results from <span className="text-primary">floridalottery.com</span>. Predictions are auto-evaluated against new draws.
        </p>

        <Button onClick={handleFetchAll} disabled={isFetching}
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90" size="lg">
          {fetchAll.isPending ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Fetching All Games...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />Fetch All Games (Latest)</>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/50" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or fetch by game</span>
          </div>
        </div>

        <div className="space-y-3">
          <Select value={gameType} onValueChange={(v) => setGameType(v as GameType)}>
            <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              {gameOptions.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button onClick={handleFetchSingle} disabled={isFetching} variant="outline"
              className="flex-1 border-primary/30 text-primary hover:bg-primary/10">
              <Download className="w-4 h-4 mr-1" />
              {fetchLatest.isPending ? "Fetching..." : "Latest"}
            </Button>
            <Button onClick={handleFetchHistory} disabled={isFetching} variant="outline"
              className="flex-1 border-accent/30 text-accent hover:bg-accent/10">
              <History className="w-4 h-4 mr-1" />
              {fetchHistory.isPending ? "Loading..." : "Bulk History"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Bulk History fetches up to 500 past draws from official FL Lottery records.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PdfUploadSection() {
  const [uploading, setUploading] = useState(false);
  const [gameType, setGameType] = useState<GameType | "auto">("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: uploads, refetch: refetchUploads } = trpc.dataFetch.pdfUploads.useQuery();
  const utils = trpc.useUtils();

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please select a PDF file");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("File too large. Maximum 16MB.");
      return;
    }

    setUploading(true);
    try {
      // Read file as base64
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const response = await fetch("/api/upload-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64,
          gameType: gameType === "auto" ? undefined : gameType,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("PDF uploaded! Numbers are being extracted...");
        refetchUploads();
        // Poll for completion
        const pollInterval = setInterval(async () => {
          const updated = await refetchUploads();
          const upload = updated.data?.find((u: any) => u.id === result.uploadId);
          if (upload && upload.status !== "processing" && upload.status !== "pending") {
            clearInterval(pollInterval);
            if (upload.status === "completed") {
              toast.success(`Extracted ${upload.drawsExtracted} draws from PDF!`);
              utils.draws.all.invalidate();
              utils.schedule.dataHealth.invalidate();
            } else {
              toast.error(`PDF processing failed: ${upload.errorMessage || "Unknown error"}`);
            }
          }
        }, 3000);
        // Stop polling after 2 minutes
        setTimeout(() => clearInterval(pollInterval), 120000);
      } else {
        toast.error(result.error || "Upload failed");
      }
    } catch (err) {
      toast.error("Failed to upload PDF");
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Upload PDF Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload PDF files containing historical winning numbers. Numbers will be extracted and added to the prediction database.
        </p>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Game Type (optional)</Label>
            <Select value={gameType} onValueChange={(v) => setGameType(v as GameType | "auto")}>
              <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect from PDF</SelectItem>
                {gameOptions.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full bg-primary text-primary-foreground"
            size="lg"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading &amp; Processing...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />Select PDF File</>
            )}
          </Button>
        </div>

        {/* Upload History */}
        {uploads && uploads.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground font-medium">Recent Uploads</p>
            {uploads.slice(0, 5).map((upload: any) => (
              <div key={upload.id} className="flex items-center gap-2 text-xs">
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1 text-foreground">{upload.fileName}</span>
                {upload.status === "completed" ? (
                  <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400 flex-shrink-0">
                    <CheckCircle className="w-3 h-3 mr-1" />{upload.drawsExtracted} draws
                  </Badge>
                ) : upload.status === "processing" || upload.status === "pending" ? (
                  <Badge variant="outline" className="text-[9px] border-primary/30 text-primary flex-shrink-0">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive flex-shrink-0">
                    <XCircle className="w-3 h-3 mr-1" />Failed
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Supports PDF files up to 16MB. AI extracts numbers automatically.
        </p>
      </CardContent>
    </Card>
  );
}

function DataHealthDashboard() {
  const { data, isLoading } = trpc.schedule.dataHealth.useQuery();

  if (isLoading) {
    return <div className="grid grid-cols-3 gap-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>;
  }

  if (!data) return null;

  const maxCount = Math.max(...data.map(d => d.drawCount), 1);

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Data Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.gameType} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{d.gameName}</span>
                <span className="font-mono text-foreground">{d.drawCount} draws</span>
              </div>
              <Progress value={(d.drawCount / maxCount) * 100} className="h-2" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          More historical data = better predictions. Aim for 50+ draws per game.
        </p>
      </CardContent>
    </Card>
  );
}

function ModelAccuracyDashboard() {
  const [gameType, setGameType] = useState<GameType>("fantasy_5");
  const { data: stats, isLoading: statsLoading } = trpc.performance.stats.useQuery({ gameType });
  const { data: weights, isLoading: weightsLoading } = trpc.performance.weights.useQuery({ gameType });

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const isLoading = statsLoading || weightsLoading;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent" />
            Model Accuracy Tracker
          </CardTitle>
          <Select value={gameType} onValueChange={(v) => setGameType(v as GameType)}>
            <SelectTrigger className="w-[140px] bg-input text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gameOptions.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8" />)}</div>
        ) : !stats || stats.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No accuracy data yet.</p>
            <p className="text-xs mt-1">Generate predictions, then add draw results to start tracking.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_60px_60px_60px] gap-2 text-[10px] text-muted-foreground font-medium pb-1 border-b border-border/50">
              <span>Model</span>
              <span className="text-right">Evals</span>
              <span className="text-right">Avg Hits</span>
              <span className="text-right">Weight</span>
            </div>
            {stats
              .sort((a, b) => Number(b.avgMainHits) - Number(a.avgMainHits))
              .map(s => {
                const weight = weights?.[s.modelName];
                const avgHits = Number(s.avgMainHits).toFixed(1);
                return (
                  <div key={s.modelName} className="grid grid-cols-[1fr_60px_60px_60px] gap-2 text-xs items-center">
                    <span className="font-mono text-foreground truncate">{s.modelName}</span>
                    <span className="text-right text-muted-foreground">{s.totalPredictions}</span>
                    <span className="text-right font-bold text-primary">{avgHits}</span>
                    <span className="text-right">
                      {weight !== undefined ? (
                        <Badge variant="outline" className={`text-[9px] ${weight > 0.7 ? "border-primary/50 text-primary" : "border-border/50 text-muted-foreground"}`}>
                          {(weight * 100).toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">
          Weights auto-adjust as more data is collected. Higher weight = more influence in AI Oracle ensemble.
        </p>
      </CardContent>
    </Card>
  );
}

function AllDrawResults() {
  const { data, isLoading } = trpc.draws.all.useQuery({ limit: 100 });

  if (isLoading) {
    return <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No draw results yet. Use "Fetch All Games" above.</p>
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

function AutoFetchStatusCard() {
  const { data: status, isLoading } = trpc.dataFetch.autoFetchStatus.useQuery(undefined, {
    refetchInterval: 30_000, // refresh every 30s
  });
  const triggerFetch = trpc.dataFetch.triggerAutoFetch.useMutation();
  const utils = trpc.useUtils();

  const handleTrigger = () => {
    triggerFetch.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(`Auto-fetch complete: ${result.totalNewDraws} new draws, ${result.totalEvaluations} evaluations`);
        utils.dataFetch.autoFetchStatus.invalidate();
        utils.draws.latest.invalidate();
        utils.draws.all.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  if (isLoading) return <Skeleton className="h-24 w-full mb-6" />;

  const lastRun = status?.lastRun;
  const isRunning = status?.isRunning || triggerFetch.isPending;
  const timeSinceLastRun = lastRun ? Math.round((Date.now() - lastRun.timestamp) / 60000) : null;

  return (
    <Card className="bg-card border-green-500/20 mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Timer className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Auto-Fetch Schedule</h3>
                <Badge variant="outline" className={status?.isScheduleActive ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-muted-foreground"}>
                  {status?.isScheduleActive ? "Active" : "Inactive"}
                </Badge>
                {isRunning && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically fetches latest draws every 6 hours and evaluates all models.
                {lastRun && timeSinceLastRun !== null && (
                  <> Last run: <span className="text-foreground">{timeSinceLastRun < 1 ? "just now" : `${timeSinceLastRun}m ago`}</span>
                  {lastRun.totalNewDraws > 0 && <> — <span className="text-green-400">{lastRun.totalNewDraws} new draws</span></>}
                  {lastRun.totalEvaluations > 0 && <>, <span className="text-primary">{lastRun.totalEvaluations} evaluations</span></>}
                  {lastRun.errors.length > 0 && <>, <span className="text-red-400">{lastRun.errors.length} error(s)</span></>}
                  </>
                )}
                {!lastRun && " Waiting for first run..."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTrigger}
            disabled={isRunning}
            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
          >
            <Zap className={`w-4 h-4 mr-1 ${isRunning ? "animate-pulse" : ""}`} />
            {isRunning ? "Fetching..." : "Run Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>
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
              <Button asChild className="bg-primary text-primary-foreground"><a href={getLoginUrl()}>Sign In</a></Button>
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

        {/* Auto-Fetch Status */}
        <AutoFetchStatusCard />

        {/* Quick Actions: Fetch + Upload (most used) */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <FetchDataSection />
          <PdfUploadSection />
        </div>

        {/* Data Health + Model Accuracy */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <DataHealthDashboard />
          <ModelAccuracyDashboard />
        </div>

        {/* Add Draw Manually */}
        <div className="grid lg:grid-cols-1 gap-6 mb-8">
          <AddDrawForm />
        </div>

        {/* All Draw Results */}
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
