import { useAuth } from "@/_core/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { getLoginUrl } from "@/const";
import { History as HistoryIcon, Ticket, Clock, LogIn } from "lucide-react";

function LottoBall({ number, variant = "main" }: { number: number; variant?: "main" | "special" }) {
  return (
    <span className={`lotto-ball ${variant === "special" ? "lotto-ball-special" : "lotto-ball-main"}`}>
      {number}
    </span>
  );
}

function PredictionHistory() {
  const { data, isLoading } = trpc.predictions.history.useQuery({ limit: 50 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <HistoryIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No prediction history yet. Generate some predictions first!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((pred) => {
        const mainNums = pred.mainNumbers as number[];
        const specialNums = pred.specialNumbers as number[] | null;
        const gameCfg = FLORIDA_GAMES[pred.gameType as GameType];
        return (
          <Card key={pred.id} className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{gameCfg?.name || pred.gameType}</Badge>
                  <span className="text-xs text-primary font-medium">{pred.modelName.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {new Date(pred.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5 flex-wrap">
                  {mainNums.map((n, i) => <LottoBall key={i} number={n} />)}
                  {specialNums && specialNums.length > 0 && specialNums.map((n, i) => (
                    <LottoBall key={`s-${i}`} number={n} variant="special" />
                  ))}
                </div>
                <Badge variant="secondary" className="text-xs ml-auto">
                  {Math.round(pred.confidenceScore * 100)}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TicketHistory() {
  const { data, isLoading } = trpc.tickets.history.useQuery({ limit: 20 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No ticket selections yet. Generate budget tickets first!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((sel) => {
        const tickets = sel.tickets as Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }>;
        const gameCfg = FLORIDA_GAMES[sel.gameType as GameType];
        return (
          <Card key={sel.id} className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{gameCfg?.name || sel.gameType}</Badge>
                  <span className="text-xs text-muted-foreground">{sel.ticketCount} tickets &middot; ${sel.budget}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(sel.createdAt).toLocaleString()}</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {tickets.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-6">#{i + 1}</span>
                    <div className="flex gap-1 flex-wrap">
                      {t.mainNumbers.map((n, j) => (
                        <span key={j} className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">{n}</span>
                      ))}
                      {t.specialNumbers.map((n, j) => (
                        <span key={`s-${j}`} className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold">{n}</span>
                      ))}
                    </div>
                    <span className="text-muted-foreground ml-auto">{t.modelSource.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function History() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <LogIn className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <h2 className="text-xl font-semibold mb-2">Sign in to view your history</h2>
          <p className="text-sm text-muted-foreground mb-6">Your prediction and ticket history is saved when you're signed in.</p>
          <Button asChild className="bg-primary text-primary-foreground">
            <a href={getLoginUrl()}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8">
        <h1 className="text-2xl font-bold mb-6">Your History</h1>

        <Tabs defaultValue="predictions" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="predictions">Predictions</TabsTrigger>
            <TabsTrigger value="tickets">Ticket Selections</TabsTrigger>
          </TabsList>

          <TabsContent value="predictions">
            <PredictionHistory />
          </TabsContent>

          <TabsContent value="tickets">
            <TicketHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
