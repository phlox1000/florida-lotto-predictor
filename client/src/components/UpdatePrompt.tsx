import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

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
 * Clicking "Update Now" sends a SKIP_WAITING message to the waiting SW,
 * which triggers `controllerchange` → automatic page reload.
 */
export default function UpdatePrompt() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = () => setShowBanner(true);
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  const applyUpdate = () => {
    const reg = window.__swRegistration;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // The controllerchange listener in index.html will reload the page
  };

  if (!showBanner) return null;

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
