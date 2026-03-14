import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Dices, History, BarChart3, Shield, Brain, GitCompareArrows, Heart, Settings, Menu, X, Target, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { path: "/", label: "Oracle", icon: Dices },
  { path: "/predictions", label: "Predictions", icon: BarChart3 },
  { path: "/history", label: "History", icon: History },
  { path: "/analysis", label: "AI Analysis", icon: Brain },
  { path: "/compare", label: "Compare", icon: GitCompareArrows },
  { path: "/favorites", label: "Favorites", icon: Heart },
  { path: "/tracker", label: "Tracker", icon: Target },
  { path: "/patterns", label: "Patterns", icon: TrendingUp },
];

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center glow-cyan-sm">
            <Dices className="w-5 h-5 text-primary" />
          </div>
          <span className="text-lg font-bold text-foreground">
            FL Lotto <span className="text-primary text-glow-cyan">Oracle</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map(item => (
            <Link key={item.path} href={item.path}>
              <span className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location === item.path
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </span>
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin">
              <span className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location === "/admin"
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}>
                <Shield className="w-4 h-4" />
                Admin
              </span>
            </Link>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2">
          {loading ? (
            <div className="w-20 h-8 rounded bg-muted animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <Link href="/settings">
                <span className={`flex items-center gap-1 px-2 py-2 rounded-md text-sm transition-colors ${
                  location === "/settings"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}>
                  <Settings className="w-4 h-4" />
                </span>
              </Link>
              <span className="text-sm text-muted-foreground">{user.name || "User"}</span>
              <Button variant="outline" size="sm" onClick={() => logout()} className="border-border">
                Sign Out
              </Button>
            </div>
          ) : (
            <Button size="sm" asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <a href={getLoginUrl()}>Sign In</a>
            </Button>
          )}
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2 text-muted-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background p-4 space-y-1">
          {navItems.map(item => (
            <Link key={item.path} href={item.path} onClick={() => setMobileOpen(false)}>
              <span className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium ${
                location === item.path
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground"
              }`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </span>
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin" onClick={() => setMobileOpen(false)}>
              <span className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground">
                <Shield className="w-4 h-4" />
                Admin
              </span>
            </Link>
          )}
          {user && (
            <Link href="/settings" onClick={() => setMobileOpen(false)}>
              <span className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium ${
                location === "/settings"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground"
              }`}>
                <Settings className="w-4 h-4" />
                Settings
              </span>
            </Link>
          )}
          <div className="pt-2 border-t border-border">
            {user ? (
              <Button variant="outline" size="sm" onClick={() => { logout(); setMobileOpen(false); }} className="w-full">
                Sign Out
              </Button>
            ) : (
              <Button size="sm" asChild className="w-full bg-primary text-primary-foreground">
                <a href={getLoginUrl()}>Sign In</a>
              </Button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
