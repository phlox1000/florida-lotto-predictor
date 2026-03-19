import { useAuth } from "@/_core/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getLoginUrl } from "@/const";
import {
  DollarSign, TrendingUp, TrendingDown, Trophy, Ticket, Plus, Trash2,
  LogIn, CheckCircle, XCircle, Clock, BarChart3, Target,
  Camera,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function extractDrawPeriodFromNotes(
  notes: string | null | undefined
): "midday" | "evening" | null {
  if (!notes) return null;
  const m = notes.match(/Draw period:\s*(midday|evening)/i);
  if (!m) return null;
  const value = (m[1] || "").toLowerCase();
  if (value !== "midday" && value !== "evening") return null;
  return value as "midday" | "evening";
}

function ROIDashboard() {
  const { data: stats, isLoading } = trpc.tracker.stats.useQuery();
  const { data: byGame, isLoading: byGameLoading } = trpc.tracker.statsByGame.useQuery();
  const { data: ticketAnalytics, isLoading: analyticsLoading } = trpc.tickets.ticketAnalytics.useQuery();

  if (isLoading) {
    return <div className="grid sm:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div>;
  }

  if (!stats) return null;

  const roiColor = stats.roi >= 0 ? "text-green-400" : "text-red-400";
  const roiIcon = stats.roi >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><DollarSign className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold text-foreground">${stats.totalSpent.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10"><Trophy className="w-5 h-5 text-accent" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Won</p>
                <p className="text-xl font-bold text-accent">${stats.totalWon.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.roi >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                {roiIcon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ROI</p>
                <p className={`text-xl font-bold ${roiColor}`}>{stats.roi >= 0 ? "+" : ""}{stats.roi}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted"><Ticket className="w-5 h-5 text-muted-foreground" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Tickets</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold text-foreground">{stats.totalTickets}</p>
                  <span className="text-xs text-muted-foreground">
                    {stats.wins}W / {stats.losses}L / {stats.pending}P
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROI by Game */}
      {!byGameLoading && byGame && byGame.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              ROI by Game
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byGame.map((g: any) => {
                const spent = Number(g.totalSpent) || 0;
                const won = Number(g.totalWon) || 0;
                const roi = spent > 0 ? ((won - spent) / spent) * 100 : 0;
                const gameCfg = FLORIDA_GAMES[g.gameType as GameType];
                return (
                  <div key={g.gameType} className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className="text-[10px] w-24 justify-center">{gameCfg?.name || g.gameType}</Badge>
                    <span className="text-muted-foreground w-16 text-right">${spent.toFixed(0)} spent</span>
                    <span className="text-accent w-16 text-right">${won.toFixed(0)} won</span>
                    <span className={`font-bold w-16 text-right ${roi >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground">{g.totalTickets} tickets ({Number(g.wins) || 0} wins)</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticket Scanner Analytics */}
      {!analyticsLoading && ticketAnalytics && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Ticket Scanner Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Top Models (most played)</p>
                <div className="space-y-1">
                  {ticketAnalytics.modelsPlayedMost?.slice(0, 3).map((m: any) => (
                    <div key={m.model} className="flex items-center justify-between text-xs">
                      <span className="text-foreground/90 truncate pr-2">{m.model}</span>
                      <span className="text-muted-foreground">{m.count}</span>
                    </div>
                  )) || <p className="text-xs text-muted-foreground">No scanned tickets yet.</p>}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Best Profit Models</p>
                <div className="space-y-1">
                  {ticketAnalytics.modelsWonMoney?.slice(0, 3).map((m: any) => (
                    <div key={m.model} className="flex items-center justify-between text-xs">
                      <span className="text-foreground/90 truncate pr-2">{m.model}</span>
                      <span className={`font-bold ${m.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {m.profit >= 0 ? "+" : ""}${Number(m.profit || 0).toFixed(0)}
                      </span>
                    </div>
                  )) || <p className="text-xs text-muted-foreground">No wins recorded yet.</p>}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Best Hit Rate Models</p>
                <div className="space-y-1">
                  {(ticketAnalytics.hitRateByModel || []).slice(0, 3).map((m: any) => (
                    <div key={m.model} className="flex items-center justify-between text-xs">
                      <span className="text-foreground/90 truncate pr-2">{m.model}</span>
                      <span className="text-muted-foreground">{Number(m.hitRate || 0).toFixed(1)}%</span>
                    </div>
                  )) || <p className="text-xs text-muted-foreground">No evaluated tickets yet.</p>}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Midday vs Evening</p>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Midday</span>
                    <span className="text-foreground">{ticketAnalytics.middayVsEvening?.midday || 0} tickets</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Evening</span>
                    <span className="text-foreground">{ticketAnalytics.middayVsEvening?.evening || 0} tickets</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScanTicketDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [cost, setCost] = useState("1");
  const [preview, setPreview] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);

  const utils = trpc.useUtils();

  const readFileAsBase64 = async (f: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const idx = result.indexOf("base64,");
        const base64 = idx >= 0 ? result.slice(idx + "base64,".length) : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(f);
    });
  };

  const handleScan = async () => {
    if (!file) {
      toast.error("Select a ticket image first");
      return;
    }
    const numericCost = parseFloat(cost);
    if (!Number.isFinite(numericCost) || numericCost < 0) {
      toast.error("Cost must be a non-negative number");
      return;
    }

    setIsScanning(true);
    setPreview(null);
    try {
      const base64 = await readFileAsBase64(file);
      const response = await fetch("/api/upload-ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64,
          cost: numericCost,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Ticket scan failed");
      }

      setPreview(json);
      toast.success("Ticket scanned and added to your tracker");
      utils.tracker.list.invalidate();
      utils.tracker.stats.invalidate();
      utils.tracker.statsByGame.invalidate();
      utils.tickets.ticketAnalytics.invalidate();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Ticket scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-card border-border/50 text-foreground hover:bg-card/80">
          <Camera className="w-4 h-4 mr-2" />
          Scan Ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Ticket Scanner
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Ticket Photo</Label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Cost ($)</Label>
            <Input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} className="bg-input h-9" />
          </div>

          {preview?.extracted && (
            <div className="space-y-2 p-3 rounded-lg border border-border/30 bg-background/30">
              <p className="text-xs text-muted-foreground">Extracted:</p>
              <p className="text-xs font-bold">{preview.extracted.gameType}</p>
              <p className="text-[11px] text-muted-foreground">
                {preview.extracted.drawDate} ({preview.extracted.drawTime})
              </p>
              <p className="text-[11px] text-muted-foreground">
                Main: {Array.isArray(preview.extracted.mainNumbers) ? preview.extracted.mainNumbers.join(", ") : "-"}
              </p>
              {preview.extracted.specialNumbers?.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Special: {preview.extracted.specialNumbers.join(", ")}
                </p>
              )}
              {preview.matchedModel && (
                <p className="text-[11px] text-muted-foreground">
                  Matched model: {preview.matchedModel}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" disabled={isScanning} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-primary text-primary-foreground" disabled={isScanning || !file} onClick={handleScan}>
              {isScanning ? "Scanning..." : "Scan & Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogPurchaseDialog() {
  const [open, setOpen] = useState(false);
  const [gameType, setGameType] = useState<GameType>("fantasy_5");
  const [mainNumbers, setMainNumbers] = useState("");
  const [specialNumbers, setSpecialNumbers] = useState("");
  const [cost, setCost] = useState("1");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [modelSource, setModelSource] = useState("");

  const logPurchase = trpc.tracker.logPurchase.useMutation();
  const utils = trpc.useUtils();

  const gameCfg = FLORIDA_GAMES[gameType];

  const gameOptions = useMemo(() =>
    GAME_TYPES.map(id => ({ id, name: FLORIDA_GAMES[id].name })),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mainNums = mainNumbers.split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    const specialNums = specialNumbers ? specialNumbers.split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n)) : [];

    if (mainNums.length !== gameCfg.mainCount) {
      toast.error(`${gameCfg.name} requires exactly ${gameCfg.mainCount} main numbers`);
      return;
    }

    logPurchase.mutate({
      gameType,
      mainNumbers: mainNums,
      specialNumbers: specialNums.length > 0 ? specialNums : undefined,
      purchaseDate: new Date(purchaseDate).getTime(),
      cost: parseFloat(cost) || gameCfg.ticketPrice,
      notes: notes || undefined,
      modelSource: modelSource || undefined,
    }, {
      onSuccess: () => {
        toast.success("Ticket logged!");
        setMainNumbers("");
        setSpecialNumbers("");
        setNotes("");
        setModelSource("");
        setOpen(false);
        utils.tracker.list.invalidate();
        utils.tracker.stats.invalidate();
        utils.tracker.statsByGame.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />Log Ticket Purchase
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />Log Purchased Ticket
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Game</Label>
              <Select value={gameType} onValueChange={(v) => setGameType(v as GameType)}>
                <SelectTrigger className="bg-input h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gameOptions.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Purchase Date</Label>
              <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="bg-input h-9" required />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Main Numbers ({gameCfg.mainCount}, comma-separated)</Label>
            <Input value={mainNumbers} onChange={e => setMainNumbers(e.target.value)}
              placeholder={`e.g. ${Array.from({ length: gameCfg.mainCount }, (_, i) => i + 1).join(", ")}`}
              className="bg-input h-9" required />
          </div>

          {gameCfg.specialCount > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Special Number(s) ({gameCfg.specialCount})</Label>
              <Input value={specialNumbers} onChange={e => setSpecialNumbers(e.target.value)} placeholder="e.g. 5" className="bg-input h-9" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cost ($)</Label>
              <Input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} className="bg-input h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Model Source (optional)</Label>
              <Input value={modelSource} onChange={e => setModelSource(e.target.value)} placeholder="e.g. AI Oracle" className="bg-input h-9" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Quick pick at 7-Eleven" className="bg-input h-9" />
          </div>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" disabled={logPurchase.isPending} className="bg-primary text-primary-foreground">
              {logPurchase.isPending ? "Logging..." : "Log Ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketList() {
  const { data: tickets, isLoading } = trpc.tracker.list.useQuery({ limit: 100 });
  const updateOutcome = trpc.tracker.updateOutcome.useMutation();
  const deleteTicket = trpc.tracker.delete.useMutation();
  const utils = trpc.useUtils();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [winAmount, setWinAmount] = useState("");

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>;
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No tickets logged yet.</p>
        <p className="text-xs mt-1">Use "Log Ticket Purchase" to start tracking your plays.</p>
      </div>
    );
  }

  const handleOutcome = (id: number, outcome: "win" | "loss") => {
    if (outcome === "win" && editingId !== id) {
      setEditingId(id);
      setWinAmount("");
      return;
    }

    const amount = outcome === "win" ? parseFloat(winAmount) || 0 : 0;

    updateOutcome.mutate({ id, outcome, winAmount: amount }, {
      onSuccess: () => {
        toast.success(outcome === "win" ? `Win of $${amount} recorded!` : "Marked as loss");
        setEditingId(null);
        setWinAmount("");
        utils.tracker.list.invalidate();
        utils.tracker.stats.invalidate();
        utils.tracker.statsByGame.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDelete = (id: number) => {
    deleteTicket.mutate({ id }, {
      onSuccess: () => {
        toast.success("Ticket removed");
        utils.tracker.list.invalidate();
        utils.tracker.stats.invalidate();
        utils.tracker.statsByGame.invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-2">
      {tickets.map((ticket: any) => {
        const mainNums = ticket.mainNumbers as number[];
        const specialNums = ticket.specialNumbers as number[] | null;
        const gameCfg = FLORIDA_GAMES[ticket.gameType as GameType];
        const drawPeriod = extractDrawPeriodFromNotes(ticket.notes as string | null | undefined);
        const drawDate = ticket.drawDate ? new Date(ticket.drawDate).toLocaleDateString() : null;
        const isEditing = editingId === ticket.id;

        return (
          <Card key={ticket.id} className="bg-card/50 border-border/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className="text-[10px]">{gameCfg?.name || ticket.gameType}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(ticket.purchaseDate).toLocaleDateString()}
                    </span>
                    {drawPeriod && drawDate && (
                      <span className="text-[10px] text-cyan-400/70">
                        Draw: {drawPeriod} {drawDate}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">${Number(ticket.cost).toFixed(2)}</span>
                    {ticket.modelSource && (
                      <span className="text-[10px] text-primary/60">{ticket.modelSource}</span>
                    )}
                  </div>

                  <div className="flex gap-1 flex-wrap mb-1.5">
                    {mainNums.map((n, i) => (
                      <span key={i} className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">{n}</span>
                    ))}
                    {specialNums && specialNums.length > 0 && specialNums.map((n, i) => (
                      <span key={`s-${i}`} className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold">{n}</span>
                    ))}
                  </div>

                  {ticket.notes && (
                    <p className="text-[10px] text-muted-foreground truncate">{ticket.notes}</p>
                  )}

                  {(ticket.mainHits !== null && ticket.mainHits !== undefined) && ticket.outcome !== "pending" && (
                    <p className="text-[10px] text-muted-foreground">
                      Hits: {Number(ticket.mainHits)}/{gameCfg.mainCount}
                      {gameCfg.specialCount > 0 && (
                        <>; Special: {Number(ticket.specialHits || 0)}/{gameCfg.specialCount}</>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {ticket.outcome === "pending" ? (
                    <>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={winAmount}
                            onChange={e => setWinAmount(e.target.value)}
                            placeholder="$"
                            className="w-20 h-7 text-xs bg-input"
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-400 hover:text-green-300"
                            onClick={() => handleOutcome(ticket.id, "win")}>
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                            onClick={() => setEditingId(null)}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            onClick={() => handleOutcome(ticket.id, "win")} title="Mark as win">
                            <Trophy className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => handleOutcome(ticket.id, "loss")} title="Mark as loss">
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-400">
                        <Clock className="w-3 h-3 mr-0.5" />Pending
                      </Badge>
                    </>
                  ) : ticket.outcome === "win" ? (
                    <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400">
                      <Trophy className="w-3 h-3 mr-0.5" />${Number(ticket.winAmount).toFixed(2)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400">
                      <XCircle className="w-3 h-3 mr-0.5" />Loss
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-1 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(ticket.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function Tracker() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <LogIn className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <h2 className="text-xl font-semibold mb-2">Sign in to track your tickets</h2>
          <p className="text-sm text-muted-foreground mb-6">Log your purchases, record wins, and track your ROI over time.</p>
          <Button asChild className="bg-primary text-primary-foreground"><a href={getLoginUrl()}>Sign In</a></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-accent" />
            Win/Loss Tracker
          </h1>
          <div className="flex items-center gap-2">
            <LogPurchaseDialog />
            <ScanTicketDialog />
          </div>
        </div>

        {/* ROI Dashboard */}
        <div className="mb-6">
          <ROIDashboard />
        </div>

        {/* Ticket List */}
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" />
              Purchased Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
