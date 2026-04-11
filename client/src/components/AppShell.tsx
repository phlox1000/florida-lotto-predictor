/**
 * AppShell — unified mobile-first 4-tab navigation shell.
 *
 * Architecture:
 *   - Sticky top bar: app logo + auth controls
 *   - Content area: fills remaining height, scrollable
 *   - Sticky bottom tab bar: 4 tabs (Analyze / Generate / Track / Models)
 *
 * Tab routing uses wouter's useLocation so deep links still work.
 * Legacy pages (History, Compare, H2H, Wheel, Patterns, Favorites, Settings, Admin)
 * remain accessible via their original routes but are not in the bottom bar.
 *
 * One-hand usability: bottom bar height is 64px with 44px touch targets.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart3, Brain, Dices, LogIn, LogOut, Settings, Target, Trophy } from "lucide-react";
import { Link, useLocation } from "wouter";

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  {
    path: "/app/analyze",
    label: "Analyze",
    icon: BarChart3,
    description: "Predictions & insights",
  },
  {
    path: "/app/generate",
    label: "Generate",
    icon: Dices,
    description: "Tickets & wheel",
  },
  {
    path: "/app/track",
    label: "Track",
    icon: Target,
    description: "ROI & outcomes",
  },
  {
    path: "/app/models",
    label: "Models",
    icon: Trophy,
    description: "Leaderboard & analysis",
  },
] as const;

// ─── Bottom tab bar ───────────────────────────────────────────────────────────

function BottomTabBar({ currentPath }: { currentPath: string }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-16">
        {TABS.map((tab) => {
          const isActive =
            currentPath === tab.path ||
            currentPath.startsWith(tab.path + "/");
          return (
            <Link key={tab.path} href={tab.path} className="flex-1">
              <span
                className={`
                  flex flex-col items-center justify-center gap-0.5 h-full w-full
                  transition-colors select-none
                  ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                <tab.icon
                  className={`w-5 h-5 transition-all ${isActive ? "glow-cyan-sm scale-110" : ""}`}
                />
                <span
                  className={`text-[10px] font-medium leading-none ${
                    isActive ? "text-primary" : ""
                  }`}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <Link href="/app/analyze" className="flex items-center gap-2 no-underline">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center glow-cyan-sm">
            <Dices className="w-4 h-4 text-primary" />
          </div>
          <span className="text-base font-bold text-foreground leading-none">
            FL Lotto <span className="text-primary text-glow-cyan">Oracle</span>
          </span>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <Link href="/settings">
            <span className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Settings className="w-4 h-4" />
            </span>
          </Link>
          {user ? (
            <button
              onClick={logout}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <a
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors no-underline"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar />

      {/* Main content — padded to avoid bottom tab bar overlap */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      <BottomTabBar currentPath={location} />
    </div>
  );
}

// ─── Re-export tab paths for use in screens ───────────────────────────────────

export const TAB_PATHS = {
  analyze: "/app/analyze",
  generate: "/app/generate",
  track: "/app/track",
  models: "/app/models",
} as const;
