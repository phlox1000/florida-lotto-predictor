import { useEffect, useState } from "react";
import { RefreshCw, X, AlertTriangle } from "lucide-react";
import { APP_VERSION, isMajorBump, recordUpdate } from "@/lib/version";

declare global {
  interface Window {
    __swRegistration?: ServiceWorkerRegistration;
  }
}

/**
 * Listens for the `sw-update-available` custom event dispatched by the
 * service-worker registration script in index.html.  When a new SW is
 * waiting, it shows a sticky banner prompting the user to reload.
 *
 * For MAJOR version bumps (e.g. 4.x → 5.x), the update is applied
 * automatically after a short countdown — no user action needed.
 *
 * Clicking "Update Now" sends a SKIP_WAITING message to the waiting SW,
 * which triggers `controllerchange` → automatic page reload.
 */
export default function UpdatePrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const [isMajor, setIsMajor] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const handler = () => {
      // Check if this is a major version bump by comparing the SW version
      // we had before vs the new APP_VERSION from the fresh bundle
      const previousVersion = localStorage.getItem("fl-lotto-oracle-sw-version") || "0.0.0";
      const major = isMajorBump(previousVersion, APP_VERSION);
      setIsMajor(major);
      setShowBanner(true);

      if (major) {
        // Force-refresh: auto-apply after 5 second countdown
        recordUpdate(APP_VERSION, "force");
      }
    };
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  // Countdown timer for major updates
  useEffect(() => {
    if (!isMajor || !showBanner) return;
    if (countdown <= 0) {
      applyUpdate();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [isMajor, showBanner, countdown]);

  // Store the current SW version whenever we load
  useEffect(() => {
    localStorage.setItem("fl-lotto-oracle-sw-version", APP_VERSION);
  }, []);

  const applyUpdate = () => {
    recordUpdate(APP_VERSION, isMajor ? "force" : "manual");
    const reg = window.__swRegistration;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // The controllerchange listener in index.html will reload the page
  };

  if (!showBanner) return null;

  // Major update: prominent warning-style banner with countdown
  if (isMajor) {
    return (
      <div className="fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-gray-900/95 px-5 py-3 shadow-lg shadow-amber-500/10 backdrop-blur-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-amber-300">
              Critical Update Available
            </span>
            <span className="text-xs text-gray-400">
              Auto-applying in {countdown}s...
            </span>
          </div>
          <button
            onClick={applyUpdate}
            className="ml-2 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-gray-900 transition-colors hover:bg-amber-400"
          >
            Update Now
          </button>
        </div>
      </div>
    );
  }

  // Minor/patch update: standard cyan banner
  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-cyan-500/30 bg-gray-900/95 px-5 py-3 shadow-lg shadow-cyan-500/10 backdrop-blur-sm">
        <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-cyan-400" style={{ animationDuration: "3s" }} />
        <span className="text-sm font-medium text-gray-200">
          A new version is available
        </span>
        <button
          onClick={applyUpdate}
          className="ml-2 rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-gray-900 transition-colors hover:bg-cyan-400"
        >
          Update Now
        </button>
        <button
          onClick={() => setShowBanner(false)}
          className="ml-1 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
