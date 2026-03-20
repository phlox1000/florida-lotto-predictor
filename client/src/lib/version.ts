/**
 * Single source of truth for the app version.
 * 
 * The CHANGELOG array is the canonical version list. The latest entry's
 * `version` field is used everywhere: the service worker, the Settings page,
 * the WhatsNew modal, and the update-history log.
 * 
 * To release a new version, just add a new entry at the TOP of CHANGELOG.
 * Everything else derives from it automatically.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: { type: "feature" | "improvement" | "fix"; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "4.5.1",
    date: "2026-03-20",
    title: "PDF Upload Fix",
    changes: [
      { type: "fix", text: "PDF upload now handles large FL Lottery exports (377+ pages, 12K+ draws) instantly" },
      { type: "improvement", text: "Deterministic text parser for FL Lottery PDFs — no LLM needed, 100% accuracy" },
      { type: "improvement", text: "Auto-detects game type from PDF header for all 9 FL Lottery games" },
    ],
  },
  {
    version: "4.5.0",
    date: "2026-03-19",
    title: "Ticket Scanner & Cloud Storage",
    changes: [
      { type: "feature", text: "Ticket Scanner — snap a photo of your lottery ticket, LLM vision extracts the numbers automatically" },
      { type: "feature", text: "Cloud file storage — ticket images stored in S3 (no more local disk writes)" },
      { type: "feature", text: "Ticket Scanner Analytics — top models played, best profit models, hit rate, midday vs evening" },
      { type: "feature", text: "Manual ticket entry endpoint with auto-evaluation against existing draws" },
      { type: "improvement", text: "Auto-fetch cron now evaluates scanned tickets against new draw results" },
      { type: "improvement", text: "Ticket list shows draw period, draw date, and hit counts" },
    ],
  },
  {
    version: "4.4.0",
    date: "2026-03-15",
    title: "Head-to-Head & Consensus Strength",
    changes: [
      { type: "feature", text: "Head-to-Head Matchups — compare any two models side-by-side across all games" },
      { type: "feature", text: "Consensus Strength Score — see how many models agree on each number (14/18 = strong signal)" },
      { type: "improvement", text: "New H2H page accessible from navigation with per-game breakdown and overall winner" },
      { type: "improvement", text: "Consensus panel shows top picks, strength tiers, and agreement bar chart" },
    ],
  },
  {
    version: "4.3.0",
    date: "2026-03-15",
    title: "Smart Versioning & Update History",
    changes: [
      { type: "feature", text: "Auto-version sync — SW version always matches the changelog" },
      { type: "feature", text: "Force-refresh on major updates — critical updates apply automatically" },
      { type: "feature", text: "Update history log in Settings — see when each version was applied" },
      { type: "improvement", text: "Version is now a single source of truth, never gets out of sync" },
    ],
  },
  {
    version: "4.2.0",
    date: "2026-03-15",
    title: "Affinity Tags, Streak Alerts & CSV Export",
    changes: [
      { type: "feature", text: "Per-model Game Affinity Tags — see which games each model excels at" },
      { type: "feature", text: "Hot Streak Alerts — models hitting 3+ numbers on consecutive draws get a fire badge" },
      { type: "feature", text: "Export History to CSV — download draw results and predictions as spreadsheets" },
      { type: "improvement", text: "Hot Streak banner at top of Leaderboard highlights active winning streaks" },
    ],
  },
  {
    version: "4.1.0",
    date: "2026-03-15",
    title: "Offline Mode & Background Sync",
    changes: [
      { type: "feature", text: "Offline mode indicator shows when you lose connectivity" },
      { type: "feature", text: "Background sync queues predictions made offline and auto-submits when back online" },
      { type: "feature", text: "What's New changelog modal after every update" },
      { type: "improvement", text: "Service worker checks for updates every 5 minutes" },
    ],
  },
  {
    version: "4.0.0",
    date: "2026-03-15",
    title: "Seamless PWA Auto-Updates",
    changes: [
      { type: "feature", text: "One-click 'Update Now' banner when new version is available" },
      { type: "feature", text: "App Version card in Settings with manual update check" },
      { type: "improvement", text: "Network-first caching ensures you always get latest content" },
      { type: "fix", text: "No more uninstalling/reinstalling the PWA to get updates" },
    ],
  },
  {
    version: "3.5.0",
    date: "2026-03-14",
    title: "Auto-Fetch, Trends & Quick Pick",
    changes: [
      { type: "feature", text: "Scheduled auto-fetch scrapes draws every 6 hours and evaluates models" },
      { type: "feature", text: "Model Confidence Trends chart on Leaderboard with weekly rolling averages" },
      { type: "feature", text: "Quick Pick Comparison on Predictions page — formula vs random side-by-side" },
      { type: "improvement", text: "Admin status card shows auto-fetch schedule and last run time" },
    ],
  },
  {
    version: "3.0.0",
    date: "2026-03-14",
    title: "Heatmap & Historical Backfill",
    changes: [
      { type: "feature", text: "Number Heatmap on Patterns page — color-coded grid showing which numbers hit on which dates" },
      { type: "feature", text: "Historical win tracking with automatic backfill of past predictions" },
      { type: "feature", text: "Leaderboard populated with real model performance data" },
      { type: "improvement", text: "Hottest Numbers summary with hit counts" },
    ],
  },
  {
    version: "2.0.0",
    date: "2026-03-13",
    title: "Full Feature Launch",
    changes: [
      { type: "feature", text: "18 prediction models including AI Oracle ensemble" },
      { type: "feature", text: "9 Florida Lottery games supported" },
      { type: "feature", text: "AI Analysis page with deep LLM-powered insights" },
      { type: "feature", text: "Pattern analysis with frequency, gap, and pair charts" },
      { type: "feature", text: "Favorites, Tracker, Compare, and Wheel pages" },
      { type: "feature", text: "Push notifications for draw results and high accuracy alerts" },
      { type: "feature", text: "Printable ticket sheets with budget optimizer" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-03-12",
    title: "Initial Release",
    changes: [
      { type: "feature", text: "Core prediction engine with statistical models" },
      { type: "feature", text: "Draw history with scraping from LotteryUSA" },
      { type: "feature", text: "PWA with installable home screen app" },
    ],
  },
];

/** Current app version — always the first entry in the changelog */
export const APP_VERSION = CHANGELOG[0].version;

/** Parse a semver string into [major, minor, patch] */
export function parseSemver(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** Check if the new version is a major bump compared to old */
export function isMajorBump(oldVersion: string, newVersion: string): boolean {
  const [oldMajor] = parseSemver(oldVersion);
  const [newMajor] = parseSemver(newVersion);
  return newMajor > oldMajor;
}

// ─── Update History Log ────────────────────────────────────────────────────────

const UPDATE_HISTORY_KEY = "fl-lotto-oracle-update-history";

export interface UpdateHistoryEntry {
  version: string;
  appliedAt: string; // ISO timestamp
  method: "auto" | "manual" | "force"; // how the update was applied
}

/** Get the update history from localStorage */
export function getUpdateHistory(): UpdateHistoryEntry[] {
  try {
    const raw = localStorage.getItem(UPDATE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Record a new update in the history log */
export function recordUpdate(version: string, method: "auto" | "manual" | "force"): void {
  const history = getUpdateHistory();
  // Don't duplicate if the same version is already the latest entry
  if (history.length > 0 && history[0].version === version) return;
  history.unshift({
    version,
    appliedAt: new Date().toISOString(),
    method,
  });
  // Keep only the last 20 entries
  if (history.length > 20) history.length = 20;
  localStorage.setItem(UPDATE_HISTORY_KEY, JSON.stringify(history));
}
