import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
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
import InstallPrompt from "./components/InstallPrompt";

function Router() {
  return (
    <Switch>
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
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          <InstallPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
