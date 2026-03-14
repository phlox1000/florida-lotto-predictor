import Navbar from "@/components/Navbar";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Bell, BellOff, Trophy, Newspaper, Settings as SettingsIcon, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

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

      // Generate VAPID keys on the fly for this demo
      // In production, these would come from the server
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Use a placeholder VAPID key - in production this comes from server
        // For now, we'll store the subscription info for in-app notifications
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
        // Fallback: store subscription intent without actual push endpoint
        subscribeMutation.mutate({
          endpoint: "in-app-notification",
          p256dh: "in-app",
          auth: "in-app",
        });
        toast.info("In-app notifications enabled. Browser push may not be available on all devices.");
      }
    } catch (err) {
      console.error("Push subscription error:", err);
      // Fallback to in-app notifications
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
      </div>
    </div>
  );
}
