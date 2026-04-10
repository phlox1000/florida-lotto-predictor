import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── WhatsNew Component ─────────────────────────────────────────────────────
describe("WhatsNew changelog component", () => {
  const filePath = resolve(__dirname, "../client/src/components/WhatsNew.tsx");
  const content = readFileSync(filePath, "utf-8");

  it("exports a default component", () => {
    expect(content).toContain("export default function WhatsNew");
  });

  it("imports CHANGELOG from version module", () => {
    // CHANGELOG and ChangelogEntry were moved to client/src/lib/version.ts;
    // WhatsNew.tsx now imports them rather than defining inline.
    expect(content).toContain("CHANGELOG");
  });

  it("uses ChangelogEntry shape (version, date, title, changes) via version module", () => {
    // The interface lives in version.ts; WhatsNew references its fields through
    // entry.version, entry.date, entry.title, entry.changes in JSX.
    expect(content).toContain("entry.version");
    expect(content).toContain("entry.changes");
  });

  it("renders feature, improvement, and fix change types", () => {
    expect(content).toContain("feature");
    expect(content).toContain("improvement");
    expect(content).toContain("fix");
  });

  it("stores last-seen version in localStorage", () => {
    expect(content).toContain("localStorage.getItem");
    expect(content).toContain("localStorage.setItem");
    expect(content).toContain("fl-lotto-oracle-last-seen-version");
  });

  it("only shows modal when version is newer than last seen", () => {
    // After refactor, the comparison uses APP_VERSION from version.ts
    expect(content).toContain("lastSeen !== APP_VERSION");
  });

  it("has a dismiss function that saves current version", () => {
    expect(content).toContain("dismiss");
    expect(content).toContain("setOpen(false)");
  });

  it("has a Got it button to dismiss", () => {
    expect(content).toContain("Got it!");
  });

  it("has a Show all versions button", () => {
    expect(content).toContain("Show all");
  });

  it("includes multiple version entries via imported CHANGELOG", () => {
    // CHANGELOG entries are defined in version.ts, not inline in WhatsNew.tsx.
    // Verify the component iterates over entries (entries.map).
    expect(content).toContain("entries.map");
  });

  it("has a backdrop that dismisses on click", () => {
    expect(content).toContain("onClick={dismiss}");
    expect(content).toContain("backdrop-blur");
  });
});

// ─── OfflineIndicator Component ─────────────────────────────────────────────
describe("OfflineIndicator component", () => {
  const filePath = resolve(__dirname, "../client/src/components/OfflineIndicator.tsx");
  const content = readFileSync(filePath, "utf-8");

  it("exports a default component", () => {
    expect(content).toContain("export default function OfflineIndicator");
  });

  it("listens for online and offline window events", () => {
    expect(content).toContain('"online"');
    expect(content).toContain('"offline"');
    expect(content).toContain("addEventListener");
  });

  it("checks navigator.onLine for initial state", () => {
    expect(content).toContain("navigator.onLine");
  });

  it("shows offline message when disconnected", () => {
    expect(content).toContain("You're offline");
    expect(content).toContain("cached content is still available");
  });

  it("shows reconnected message when back online", () => {
    expect(content).toContain("Back online");
  });

  it("auto-dismisses reconnected banner after timeout", () => {
    expect(content).toContain("setTimeout");
    expect(content).toContain("setShowReconnected(false)");
  });

  it("uses WifiOff icon for offline state", () => {
    expect(content).toContain("WifiOff");
  });

  it("uses Wifi icon for reconnected state", () => {
    expect(content).toContain("Wifi");
  });

  it("cleans up event listeners on unmount", () => {
    expect(content).toContain("removeEventListener");
  });
});

// ─── useBackgroundSync Hook ─────────────────────────────────────────────────
describe("useBackgroundSync hook", () => {
  const filePath = resolve(__dirname, "../client/src/hooks/useBackgroundSync.ts");
  const content = readFileSync(filePath, "utf-8");

  it("exports the useBackgroundSync function", () => {
    expect(content).toContain("export function useBackgroundSync");
  });

  it("defines QueuedPrediction interface", () => {
    expect(content).toContain("interface QueuedPrediction");
    expect(content).toContain("gameType: string");
    expect(content).toContain("timestamp: number");
  });

  it("uses localStorage for the offline queue", () => {
    expect(content).toContain("localStorage.getItem");
    expect(content).toContain("localStorage.setItem");
    expect(content).toContain("fl-lotto-oracle-offline-queue");
  });

  it("returns queuePrediction function", () => {
    expect(content).toContain("queuePrediction");
  });

  it("returns getQueueLength function", () => {
    expect(content).toContain("getQueueLength");
  });

  it("returns clearQueue function", () => {
    expect(content).toContain("clearQueue");
  });

  it("checks navigator.onLine before queuing", () => {
    expect(content).toContain("navigator.onLine");
  });

  it("returns false when online (caller should proceed normally)", () => {
    expect(content).toContain("if (navigator.onLine) return false");
  });

  it("returns true when offline (request was queued)", () => {
    expect(content).toContain("return true");
  });

  it("shows toast when queuing offline", () => {
    expect(content).toContain("You're offline");
    expect(content).toContain("auto-submit when back online");
  });

  it("processes queue on online event", () => {
    expect(content).toContain('"online"');
    expect(content).toContain("processQueue");
  });

  it("shows success toast when queued items are processed", () => {
    expect(content).toContain("queued prediction");
    expect(content).toContain("submitted");
  });

  it("keeps failed items in queue for retry", () => {
    expect(content).toContain("remaining.push(item)");
  });
});

// ─── Integration: Predictions page uses background sync ─────────────────────
describe("Predictions page background sync integration", () => {
  const filePath = resolve(__dirname, "../client/src/pages/Predictions.tsx");
  const content = readFileSync(filePath, "utf-8");

  it("imports useBackgroundSync hook", () => {
    expect(content).toContain("useBackgroundSync");
  });

  it("uses queuePrediction from the hook", () => {
    expect(content).toContain("queuePrediction");
  });

  it("has a handleRunModels function that checks offline first", () => {
    expect(content).toContain("handleRunModels");
    expect(content).toContain("queuePrediction(selectedGame)");
  });

  it("wires handleRunModels to the Run Models button", () => {
    expect(content).toContain("onClick={handleRunModels}");
  });
});

// ─── App.tsx integration ────────────────────────────────────────────────────
describe("App.tsx includes all new components", () => {
  const filePath = resolve(__dirname, "../client/src/App.tsx");
  const content = readFileSync(filePath, "utf-8");

  it("imports WhatsNew", () => {
    expect(content).toContain('import WhatsNew from "./components/WhatsNew"');
  });

  it("imports OfflineIndicator", () => {
    expect(content).toContain('import OfflineIndicator from "./components/OfflineIndicator"');
  });

  it("renders WhatsNew component", () => {
    expect(content).toContain("<WhatsNew />");
  });

  it("renders OfflineIndicator component", () => {
    expect(content).toContain("<OfflineIndicator />");
  });
});
