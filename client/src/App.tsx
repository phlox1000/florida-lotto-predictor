import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { GameProvider } from "./contexts/GameContext";
import AppShell from "./components/AppShell";
import AnalyzeTab from "./tabs/AnalyzeTab";
import GenerateTab from "./tabs/GenerateTab";
import TrackTab from "./tabs/TrackTab";
import ModelsTab from "./tabs/ModelsTab";
import Home from "./pages/Home";
import Predictions from "./pages/Predictions";
import History from "./pages/History";
import Admin from "./pages/Admin";
import Analysis from "./pages/Analysis";
import Compare from "./pages/Compare";
import Favorites from "./pages/Favorites";
import Settings from "./pages/Settings";
import Tracker from "./pages/Tracker";
import Patterns from "./pages/Patterns";
import Leaderboard from "./pages/Leaderboard";
import Wheel from "./pages/Wheel";
import HeadToHead from "./pages/HeadToHead";
import Login from "./pages/Login";
import InstallPrompt from "./components/InstallPrompt";
import UpdatePrompt from "./components/UpdatePrompt";
import WhatsNew from "./components/WhatsNew";
import OfflineIndicator from "./components/OfflineIndicator";

function ShellRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <AppShell>
      <Component />
    </AppShell>
  );
}

function Router() {
  return (
    <Switch>
      {/* ── New tab-shell routes ── */}
      <Route path="/app/analyze">
        <ShellRoute component={AnalyzeTab} />
      </Route>
      <Route path="/app/generate">
        <ShellRoute component={GenerateTab} />
      </Route>
      <Route path="/app/track">
        <ShellRoute component={TrackTab} />
      </Route>
      <Route path="/app/models">
        <ShellRoute component={ModelsTab} />
      </Route>
      <Route path="/app">
        <Redirect to="/app/analyze" />
      </Route>
      <Route path="/" component={Home} />
      <Route path="/predictions" component={Predictions} />
      <Route path="/history" component={History} />
      <Route path="/admin" component={Admin} />
      <Route path="/analysis" component={Analysis} />
      <Route path="/compare" component={Compare} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/settings" component={Settings} />
      <Route path="/tracker" component={Tracker} />
      <Route path="/patterns" component={Patterns} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/wheel" component={Wheel} />
      <Route path="/head-to-head" component={HeadToHead} />
      <Route path="/login" component={Login} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <GameProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <InstallPrompt />
          <UpdatePrompt />
          <WhatsNew />
          <OfflineIndicator />
        </TooltipProvider>
        </GameProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
