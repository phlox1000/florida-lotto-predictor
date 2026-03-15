import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Displays a slim banner at the top of the viewport when the device
 * goes offline.  Auto-dismisses with a brief "Back online" confirmation
 * when connectivity returns.
 */
export default function OfflineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setWasOffline(true);
      setShowReconnected(false);
    };

    const goOnline = () => {
      setOnline(true);
      // Only show "Back online" if we were previously offline
      if (!navigator.onLine) return; // guard
      setShowReconnected(true);
      // Auto-dismiss the reconnected banner after 3 seconds
      setTimeout(() => setShowReconnected(false), 3000);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Nothing to show if online and no reconnect message
  if (online && !showReconnected) return null;

  // Offline banner
  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9997] animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="flex items-center justify-center gap-2 bg-amber-600/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <WifiOff className="h-4 w-4 shrink-0 animate-pulse" />
          <span>You're offline — cached content is still available</span>
        </div>
      </div>
    );
  }

  // Reconnected banner (auto-dismisses)
  if (showReconnected && wasOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9997] animate-in slide-in-from-top-2 fade-in duration-300">
        <div className="flex items-center justify-center gap-2 bg-emerald-600/95 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <Wifi className="h-4 w-4 shrink-0" />
          <span>Back online</span>
        </div>
      </div>
    );
  }

  return null;
}
