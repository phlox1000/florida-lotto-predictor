import { systemRouter } from "../_core/systemRouter";
import { router } from "../_core/trpc";
import { authRouter } from "./auth.router";
import { predictionsRouter } from "./predictions.router";
import { ticketsRouter } from "./tickets.router";
import { drawsRouter } from "./draws.router";
import { performanceRouter } from "./performance.router";
import { leaderboardRouter } from "./leaderboard.router";
import { wheelRouter } from "./wheel.router";
import { scheduleRouter } from "./schedule.router";
import { analysisRouter } from "./analysis.router";
import { favoritesRouter } from "./favorites.router";
import { pushRouter } from "./push.router";
import { exportRouter } from "./export.router";
import { compareRouter } from "./compare.router";
import { csvExportRouter } from "./csvExport.router";
import { dataFetchRouter } from "./dataFetch.router";
import { trackerRouter } from "./tracker.router";
import { patternsRouter } from "./patterns.router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  predictions: predictionsRouter,
  tickets: ticketsRouter,
  draws: drawsRouter,
  performance: performanceRouter,
  leaderboard: leaderboardRouter,
  wheel: wheelRouter,
  schedule: scheduleRouter,
  analysis: analysisRouter,
  favorites: favoritesRouter,
  push: pushRouter,
  export: exportRouter,
  compare: compareRouter,
  csvExport: csvExportRouter,
  dataFetch: dataFetchRouter,
  tracker: trackerRouter,
  patterns: patternsRouter,
});

export type AppRouter = typeof appRouter;
