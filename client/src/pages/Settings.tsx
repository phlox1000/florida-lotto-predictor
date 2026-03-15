import Navbar from "@/components/Navbar";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell, BellOff, Trophy, Newspaper, Settings as SettingsIcon, Loader2, Info, RefreshCw, History, Clock, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { APP_VERSION, getUpdateHistory, type UpdateHistoryEntry } from "@/lib/version";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function Settings() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");

  const { data: pushStatus, isLoading: pushLoading } = trpc.push.status.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const subscribeMutation = trpc.push.subscribe.useMutation({
    onSuccess: () => {
      utils.push.status.invalidate();
      toast.success("Push notifications enabled!");
    },
    onError: () => toast.error("Failed to enable push notifications"),
  });

  const updatePrefsMutation = trpc.push.updatePreferences.useMutation({
    onSuccess: () => {
      utils.push.status.invalidate();
      toast.success("Preferences updated");
    },
  });

  const unsubscribeMutation = trpc.push.unsubscribe.useMutation({
    onSuccess: () => {
      utils.push.status.invalidate();
      toast.success("Push notifications disabled");
    },
  });

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
    }
  }, []);

  const handleEnablePush = async () => {
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") {
        toast.error("Notification permission denied. Please enable it in your browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkOs-qy10dmEZSNVoaASx2_lgb_-FWP2UIDtkJPog0"
          ) as unknown as BufferSource,
        }).catch(() => null);
      }

      if (subscription) {
        const keyBuf = subscription.getKey("p256dh");
        const authBuf = subscription.getKey("auth");
        subscribeMutation.mutate({
          endpoint: subscription.endpoint,
          p256dh: keyBuf ? btoa(String.fromCharCode(...Array.from(new Uint8Array(keyBuf as ArrayBuffer)))) : "placeholder",
          auth: authBuf ? btoa(String.fromCharCode(...Array.from(new Uint8Array(authBuf as ArrayBuffer)))) : "placeholder",
        });
      } else {
        subscribeMutation.mutate({
          endpoint: "in-app-notification",
          p256dh: "in-app",
          auth: "in-app",
        });
        toast.info("In-app notifications enabled. Browser push may not be available on all devices.");
      }
    } catch (err) {
      console.error("Push subscription error:", err);
      subscribeMutation.mutate({
        endpoint: "in-app-notification",
        p256dh: "in-app",
        auth: "in-app",
      });
      toast.info("In-app notifications enabled as fallback.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <SettingsIcon className="w-16 h-16 mx-auto mb-4 text-primary/30" />
          <h1 className="text-2xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground mb-6">Sign in to manage your notification preferences.</p>
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
      <div className="container py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your notification preferences and account settings
          </p>
        </div>

        {/* Push Notifications Card */}
        <Card className="bg-card border-border/50 mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Push Notifications
            </CardTitle>
            <CardDescription>
              Get notified when new draw results are available or when your predictions score high.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {pushLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !pushStatus?.subscribed ? (
              <div className="text-center py-4">
                <BellOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground mb-4">
                  {!pushSupported
                    ? "Push notifications are not supported in this browser. In-app notifications will be used instead."
                    : pushPermission === "denied"
                    ? "Notification permission was denied. Please enable it in your browser settings."
                    : "Enable notifications to stay updated on draw results and prediction accuracy."}
                </p>
                <Button
                  onClick={handleEnablePush}
                  disabled={subscribeMutation.isPending}
                  className="bg-primary text-primary-foreground"
                >
                  {subscribeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4 mr-2" />
                  )}
                  Enable Notifications
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="push-enabled" className="text-sm font-medium">
                      Notifications Enabled
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Master toggle for all notifications
                    </p>
                  </div>
                  <Switch
                    id="push-enabled"
                    checked={pushStatus.enabled}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        unsubscribeMutation.mutate();
                      } else {
                        updatePrefsMutation.mutate({ enabled: true });
                      }
                    }}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Newspaper className="w-4 h-4 text-primary" />
                      <div className="space-y-0.5">
                        <Label htmlFor="notify-draws" className="text-sm font-medium">
                          New Draw Results
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Get notified when new lottery results are fetched
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="notify-draws"
                      checked={pushStatus.notifyDrawResults}
                      disabled={!pushStatus.enabled}
                      onCheckedChange={(checked) =>
                        updatePrefsMutation.mutate({ notifyDrawResults: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Trophy className="w-4 h-4 text-accent" />
                      <div className="space-y-0.5">
                        <Label htmlFor="notify-accuracy" className="text-sm font-medium">
                          High Prediction Accuracy
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Get notified when predictions match 60%+ of actual numbers
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="notify-accuracy"
                      checked={pushStatus.notifyHighAccuracy}
                      disabled={!pushStatus.enabled}
                      onCheckedChange={(checked) =>
                        updatePrefsMutation.mutate({ notifyHighAccuracy: checked })
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Account Info Card */}
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{user?.name || "Not set"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{user?.email || "Not set"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <Badge variant="outline" className="text-xs">{user?.role || "user"}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* App Version Card */}
        <AppVersionCard />

        {/* Update History Card */}
        <UpdateHistoryCard />
      </div>
    </div>
  );
}

function AppVersionCard() {
  const [swVersion, setSwVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Ask the SW for its version
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'SW_VERSION') {
          setSwVersion(event.data.version);
        }
      };
      navigator.serviceWorker.addEventListener('message', handler);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
      return () => navigator.serviceWorker.removeEventListener('message', handler);
    }
  }, []);

  const checkForUpdate = async () => {
    setChecking(true);
    try {
      const reg = window.__swRegistration;
      if (reg) {
        await reg.update();
        toast.success('Checked for updates');
      } else {
        toast.info('Service worker not available');
      }
    } catch {
      toast.error('Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="bg-card border-border/50 mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="w-5 h-5 text-primary" />
          App Version
        </CardTitle>
        <CardDescription>
          Current app version and update status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">App Version</span>
            <Badge variant="outline" className="text-xs font-mono">
              {APP_VERSION}
            </Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Service Worker</span>
            <Badge variant="outline" className="text-xs font-mono">
              {swVersion || 'Loading...'}
            </Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Build</span>
            <Badge variant="outline" className="text-xs font-mono">
              {new Date().toISOString().slice(0, 10)}
            </Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Auto-update</span>
            <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              Enabled (every 5 min)
            </Badge>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Force-refresh</span>
            <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
              On major updates
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={checkForUpdate}
          disabled={checking}
        >
          {checking ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Check for Updates
        </Button>
      </CardContent>
    </Card>
  );
}

function UpdateHistoryCard() {
  const [history, setHistory] = useState<UpdateHistoryEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setHistory(getUpdateHistory());
  }, []);

  const methodIcon = (method: string) => {
    switch (method) {
      case "force":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case "auto":
        return <Zap className="w-3.5 h-3.5 text-cyan-400" />;
      case "manual":
      default:
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const methodLabel = (method: string) => {
    switch (method) {
      case "force":
        return "Auto (major)";
      case "auto":
        return "Auto";
      case "manual":
      default:
        return "Manual";
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const visibleHistory = expanded ? history : history.slice(0, 5);

  return (
    <Card className="bg-card border-border/50 mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Update History
        </CardTitle>
        <CardDescription>
          Log of when each version was applied to your device
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-6">
            <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No update history yet. Updates will be logged here as they are applied.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleHistory.map((entry, i) => (
              <div
                key={`${entry.version}-${entry.appliedAt}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
                  i === 0 ? "bg-cyan-500/5 border border-cyan-500/15" : "bg-secondary/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {methodIcon(entry.method)}
                  <div>
                    <span className="font-mono font-medium text-foreground">v{entry.version}</span>
                    {i === 0 && (
                      <Badge className="ml-2 text-[10px] bg-cyan-500/15 text-cyan-400 border-cyan-500/20 px-1.5 py-0">
                        Current
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{methodLabel(entry.method)}</span>
                  <span>{formatDate(entry.appliedAt)}</span>
                </div>
              </div>
            ))}

            {history.length > 5 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full rounded-lg border border-border/50 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Show all {history.length} updates
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
