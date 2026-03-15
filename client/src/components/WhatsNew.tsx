import { useEffect, useState } from "react";
import { X, Sparkles, Zap, Bug, Star } from "lucide-react";
import { CHANGELOG, APP_VERSION, recordUpdate } from "@/lib/version";

const STORAGE_KEY = "fl-lotto-oracle-last-seen-version";

const typeIcon = {
  feature: <Star className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />,
  improvement: <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />,
  fix: <Bug className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
};

const typeLabel = {
  feature: "text-cyan-400",
  improvement: "text-amber-400",
  fix: "text-emerald-400",
};

export default function WhatsNew() {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (APP_VERSION && lastSeen !== APP_VERSION) {
      // Small delay so the page loads first
      const timer = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
    recordUpdate(APP_VERSION, "manual");
    setOpen(false);
  };

  if (!open) return null;

  const entries = showAll ? CHANGELOG : CHANGELOG.slice(0, 2);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border border-cyan-500/20 bg-gray-900/95 shadow-2xl shadow-cyan-500/10 animate-in zoom-in-95 fade-in duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-gray-900/95 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">What's New</h2>
              <p className="text-xs text-muted-foreground">Latest updates to FL Lotto Oracle</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-6" style={{ maxHeight: "calc(80vh - 140px)" }}>
          {entries.map((entry) => (
            <div key={entry.version} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-xs font-mono font-bold text-cyan-400">
                  v{entry.version}
                </span>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground">{entry.title}</h3>
              <ul className="space-y-2">
                {entry.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {typeIcon[change.type]}
                    <span className={`${typeLabel[change.type]} text-xs font-medium uppercase w-28 shrink-0`}>
                      {change.type}
                    </span>
                    <span className="text-gray-300">{change.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {!showAll && CHANGELOG.length > 2 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full rounded-lg border border-border/50 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Show all {CHANGELOG.length} versions
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-border/50 bg-gray-900/95 px-6 py-3 backdrop-blur-sm">
          <button
            onClick={dismiss}
            className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-cyan-400"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
