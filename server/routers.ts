import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, getNextDrawDate, formatTimeUntil } from "@shared/lottery";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { checkRateLimit } from "./lib/rateLimiter";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import { fetchHistoricalDraws } from "./lib/fl-lottery-scraper";
import { getLastAutoFetchResult, isAutoFetchActive, getAutoFetchRunning, runAutoFetch } from "./cron";
import { fetchRecentDraws, fetchAllGamesRecent } from "./lib/lotteryusa-scraper";
import { runAllModels, selectBudgetTickets, applySumRangeFilter } from "./predictions";
import { scorePlayTonightTickets } from "./play-tonight";
import {
  getDrawResults, insertDrawResult, getLatestDrawResults, getAllDrawResults, getDrawResultCount,
  insertPredictions, getUserPredictions, getRecentPredictions,
  insertTicketSelection, getUserTicketSelections,
  getModelPerformanceStats, getModelWeights, evaluatePredictionsAgainstDraw,
  addFavorite, getUserFavorites, removeFavorite, incrementFavoriteUsage,
  upsertPushSubscription, getUserPushSubscription, updatePushPreferences,
  getUserPdfUploads,
  insertPurchasedTicket, getUserPurchasedTickets, updatePurchasedTicketOutcome,
  deletePurchasedTicket, getUserROIStats, getROIByGame,
  getModelTrends,
  getTicketAnalytics,
} from "./db";

const gameTypeSchema = z.enum(GAME_TYPES);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Predictions ────────────────────────────────────────────────────────────
  predictions: router({
    /** Run all 18 models for a game type, using accuracy-based weights when available */
    generate: publicProcedure
      .input(z.object({ gameType: gameTypeSchema, sumRangeFilter: z.boolean().default(false) }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req?.ip ?? ctx.req?.headers?.["x-forwarded-for"] ?? "unknown";
        const rl = checkRateLimit(String(ip), 10, 60_000); // 10 per minute per IP
        if (!rl.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please wait before generating again.",
          });
        }

        const cfg = FLORIDA_GAMES[input.gameType];
        const historyRows = await getDrawResults(input.gameType, 200);
        const history = historyRows.map(r => ({
          mainNumbers: r.mainNumbers as number[],
          specialNumbers: (r.specialNumbers as number[]) || [],
          drawDate: r.drawDate,
        }));

        // Fetch model weights from historical accuracy tracking
        const modelWeights = await getModelWeights(input.gameType);
        let allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);

        // Apply Sum/Range Constraint Filter if toggled on
        if (input.sumRangeFilter) {
          allPredictions = applySumRangeFilter(allPredictions, cfg, history);
        }

        // Persist predictions if user is logged in
        if (ctx.user) {
          try {
            await insertPredictions(allPredictions.map(p => ({
              userId: ctx.user!.id,
              gameType: input.gameType,
              modelName: p.modelName,
              mainNumbers: p.mainNumbers,
              specialNumbers: p.specialNumbers,
              confidenceScore: p.confidenceScore,
              metadata: p.metadata,
            })));
          } catch (e) {
            console.warn("[Predictions] Failed to persist:", e);
          }
        }

        return {
          predictions: allPredictions,
          gameType: input.gameType,
          gameName: cfg.name,
          weightsUsed: Object.keys(modelWeights).length > 0,
          sumRangeFilterApplied: input.sumRangeFilter,
        };
      }),

    /** Get user's prediction history */
    history: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ ctx, input }) => {
        return getUserPredictions(ctx.user.id, input.limit);
      }),

    /** Generate Quick Pick random numbers for comparison against model predictions */
    quickPick: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        count: z.number().min(1).max(20).default(5),
      }))
      .mutation(({ input }) => {
        const cfg = FLORIDA_GAMES[input.gameType];
        const picks: Array<{ mainNumbers: number[]; specialNumbers: number[] }> = [];

        for (let i = 0; i < input.count; i++) {
          let mainNumbers: number[];
          if (cfg.isDigitGame) {
            // Digit games: each position is 0-9 independently
            mainNumbers = Array.from({ length: cfg.mainCount }, () => Math.floor(Math.random() * 10));
          } else {
            // Standard games: unique random numbers from pool
            const pool = Array.from({ length: cfg.mainMax }, (_, i) => i + 1);
            mainNumbers = [];
            for (let j = 0; j < cfg.mainCount; j++) {
              const idx = Math.floor(Math.random() * pool.length);
              mainNumbers.push(pool[idx]);
              pool.splice(idx, 1);
            }
            mainNumbers.sort((a, b) => a - b);
          }

          let specialNumbers: number[] = [];
          if (cfg.specialCount > 0) {
            const specPool = Array.from({ length: cfg.specialMax }, (_, i) => i + 1);
            for (let j = 0; j < cfg.specialCount; j++) {
              const idx = Math.floor(Math.random() * specPool.length);
              specialNumbers.push(specPool[idx]);
              specPool.splice(idx, 1);
            }
            specialNumbers.sort((a, b) => a - b);
          }

          picks.push({ mainNumbers, specialNumbers });
        }

        return {
          picks,
          gameType: input.gameType,
          gameName: cfg.name,
        };
      }),

    /** Get recent predictions for a game (public) */
    recent: publicProcedure
      .input(z.object({ gameType: gameTypeSchema, limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ input }) => {
        return getRecentPredictions(input.gameType, input.limit);
      }),
  }),

  // ─── Budget Ticket Selector ─────────────────────────────────────────────────
  tickets: router({
    /** Generate budget-aware ticket selection (20 tickets, $75 max) */
    generate: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        budget: z.number().min(1).max(75).default(75),
        maxTickets: z.number().min(1).max(20).default(20),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req?.ip ?? ctx.req?.headers?.["x-forwarded-for"] ?? "unknown";
        const rl = checkRateLimit(String(ip), 10, 60_000); // 10 per minute per IP
        if (!rl.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please wait before generating again.",
          });
        }

        const cfg = FLORIDA_GAMES[input.gameType];
        const historyRows = await getDrawResults(input.gameType, 200);
        const history = historyRows.map(r => ({
          mainNumbers: r.mainNumbers as number[],
          specialNumbers: (r.specialNumbers as number[]) || [],
          drawDate: r.drawDate,
        }));

        const modelWeights = await getModelWeights(input.gameType);
        const allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);
        const selection = selectBudgetTickets(cfg, allPredictions, input.budget, input.maxTickets, history);

        // Apply Play Tonight scoring with transparent breakdown
        const scoredTickets = scorePlayTonightTickets(
          selection.tickets,
          allPredictions,
          modelWeights,
          cfg,
          history.map(h => ({ mainNumbers: h.mainNumbers })),
        );

        if (ctx.user) {
          try {
            await insertTicketSelection({
              userId: ctx.user.id,
              gameType: input.gameType,
              budget: input.budget,
              ticketCount: selection.tickets.length,
              tickets: selection.tickets,
            });
          } catch (e) {
            console.warn("[Tickets] Failed to persist:", e);
          }
        }

        return {
          tickets: scoredTickets,
          totalCost: selection.totalCost,
          gameType: input.gameType,
          gameName: cfg.name,
          ticketPrice: cfg.ticketPrice,
        };
      }),

    /** Get user's ticket selection history */
    history: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
      .query(async ({ ctx, input }) => {
        return getUserTicketSelections(ctx.user.id, input.limit);
      }),

    /** Get ticket scanner analytics (models played, profit, hit rate, midday vs evening) */
    ticketAnalytics: protectedProcedure
      .query(async ({ ctx }) => {
        return getTicketAnalytics(ctx.user.id);
      }),
  }),

  // ─── Draw Results ───────────────────────────────────────────────────────────
  draws: router({
    /** Get latest draw results across all games */
    latest: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
      .query(async ({ input }) => {
        return getLatestDrawResults(input.limit);
      }),

    /** Get draw results for a specific game */
    byGame: publicProcedure
      .input(z.object({ gameType: gameTypeSchema, limit: z.number().min(1).max(200).default(50) }))
      .query(async ({ input }) => {
        return getDrawResults(input.gameType, input.limit);
      }),

    /** Get all draw results */
    all: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input }) => {
        return getAllDrawResults(input.limit);
      }),

    /** Admin: manually add a draw result */
    add: adminProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        drawDate: z.number(),
        mainNumbers: z.array(z.number()),
        specialNumbers: z.array(z.number()).optional(),
        drawTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await insertDrawResult({
          gameType: input.gameType,
          drawDate: input.drawDate,
          mainNumbers: input.mainNumbers,
          specialNumbers: input.specialNumbers || [],
          drawTime: input.drawTime,
          source: "manual",
        });

        // Auto-evaluate predictions against this new draw result
        const drawId = (result as any)?.[0]?.insertId ?? 0;
        try {
          const evalResult = await evaluatePredictionsAgainstDraw(
            drawId,
            input.gameType,
            input.mainNumbers,
            input.specialNumbers || []
          );

          if (evalResult.highAccuracy > 3) {
            await notifyOwner({
              title: "High Prediction Accuracy Detected",
              content: `${evalResult.highAccuracy} predictions matched 60%+ of the latest ${FLORIDA_GAMES[input.gameType].name} draw (${input.mainNumbers.join(", ")}). ${evalResult.evaluated} total predictions evaluated.`,
            });
          }
        } catch (e) {
          console.warn("[Draws] Auto-evaluation failed:", e);
        }

        return { success: true };
      }),
  }),

  // ─── Model Performance & Accuracy ──────────────────────────────────────────
  performance: router({
    /** Get model performance stats for a game */
    stats: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .query(async ({ input }) => {
        return getModelPerformanceStats(input.gameType);
      }),

    /** Get current model weights based on historical accuracy */
    weights: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .query(async ({ input }) => {
        return getModelWeights(input.gameType);
      }),
  }),

  // ─── Model Leaderboard ─────────────────────────────────────────────────────
  leaderboard: router({
    /** Get comprehensive leaderboard data across all games */
    all: publicProcedure.query(async () => {
      const { getDb } = await import("./db");
      const { modelPerformance } = await import("../drizzle/schema");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { models: [], totalEvaluations: 0 };

      // Aggregate stats per model across ALL games
      const rows = await db.select({
        modelName: modelPerformance.modelName,
        totalPredictions: sql<number>`COUNT(*)`,
        avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
        avgSpecialHits: sql<number>`AVG(${modelPerformance.specialHits})`,
        maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
        totalMainHits: sql<number>`SUM(${modelPerformance.mainHits})`,
        totalSpecialHits: sql<number>`SUM(${modelPerformance.specialHits})`,
        perfectMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} >= 4 THEN 1 ELSE 0 END)`,
        zeroMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} = 0 THEN 1 ELSE 0 END)`,
      }).from(modelPerformance)
        .groupBy(modelPerformance.modelName);

      // Per-game breakdown
      const perGame = await db.select({
        modelName: modelPerformance.modelName,
        gameType: modelPerformance.gameType,
        totalPredictions: sql<number>`COUNT(*)`,
        avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
        maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
      }).from(modelPerformance)
        .groupBy(modelPerformance.modelName, modelPerformance.gameType);

      // Build per-game map
      const gameBreakdown: Record<string, Array<{ gameType: string; total: number; avgHits: number; maxHits: number }>> = {};
      for (const row of perGame) {
        if (!gameBreakdown[row.modelName]) gameBreakdown[row.modelName] = [];
        gameBreakdown[row.modelName].push({
          gameType: row.gameType,
          total: Number(row.totalPredictions) || 0,
          avgHits: Number(Number(row.avgMainHits).toFixed(3)),
          maxHits: Number(row.maxMainHits) || 0,
        });
      }

      const totalEvaluations = rows.reduce((s, r) => s + (Number(r.totalPredictions) || 0), 0);

      const models = rows.map(r => {
        const total = Number(r.totalPredictions) || 0;
        const avgHits = Number(Number(r.avgMainHits).toFixed(3));
        const maxHits = Number(r.maxMainHits) || 0;
        const totalHits = Number(r.totalMainHits) || 0;
        const perfect = Number(r.perfectMatches) || 0;
        const zeros = Number(r.zeroMatches) || 0;
        const hitRate = total > 0 ? (totalHits / total) : 0;
        const consistency = total > 0 ? (1 - (zeros / total)) : 0;

        return {
          modelName: r.modelName,
          totalEvaluated: total,
          avgMainHits: avgHits,
          avgSpecialHits: Number(Number(r.avgSpecialHits).toFixed(3)),
          maxMainHits: maxHits,
          totalMainHits: totalHits,
          totalSpecialHits: Number(r.totalSpecialHits) || 0,
          perfectMatches: perfect,
          zeroMatches: zeros,
          hitRate: Number(hitRate.toFixed(3)),
          consistency: Number(consistency.toFixed(3)),
          // Composite score: weighted combination of avg hits, consistency, and max performance
          compositeScore: Number((avgHits * 0.5 + consistency * 0.3 + (maxHits / 6) * 0.2).toFixed(3)),
          gameBreakdown: gameBreakdown[r.modelName] || [],
        };
      }).sort((a, b) => b.compositeScore - a.compositeScore);

      return { models, totalEvaluations };
    }),

    /** Backfill evaluations: run all stored predictions against all stored draws to populate the leaderboard */
    backfill: adminProcedure
      .input(z.object({ gameType: gameTypeSchema.optional(), sampleSize: z.number().min(5).max(200).optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { drawResults: drawsTable, modelPerformance: perfTable } = await import("../drizzle/schema");
        const { eq, and, desc: descOp } = await import("drizzle-orm");
        const { runAllModels } = await import("./predictions");
        const db = await getDb();
        if (!db) return { evaluated: 0, skipped: 0, error: "Database not available" };

        const gamesToProcess = input.gameType ? [input.gameType] : GAME_TYPES;
        const sampleSize = input.sampleSize || 10; // evaluate last N draws (keep small for performance)
        let totalEvaluated = 0;
        let totalSkipped = 0;

        for (const gt of gamesToProcess) {
          const gameCfg = FLORIDA_GAMES[gt];
          if (!gameCfg) continue;

          // Get all draws for this game, oldest first
          const allDraws = await db.select().from(drawsTable)
            .where(eq(drawsTable.gameType, gt))
            .orderBy(descOp(drawsTable.drawDate));

          if (allDraws.length < 30) continue; // need minimum history

          // Reverse to chronological order (oldest first)
          allDraws.reverse();

          // Take the last `sampleSize` draws as test targets
          const minTrainingSize = 20;
          const testStart = Math.max(minTrainingSize, allDraws.length - sampleSize);

          for (let i = testStart; i < allDraws.length; i++) {
            const targetDraw = allDraws[i];
            // Use all draws before this one as training data
            const trainingDraws = allDraws.slice(0, i).map(d => ({
              mainNumbers: d.mainNumbers as number[],
              specialNumbers: (d.specialNumbers as number[]) || [],
              drawDate: new Date(d.drawDate).getTime(),
            }));

            // Check if we already evaluated this draw
            const existing = await db.select({ id: perfTable.id }).from(perfTable)
              .where(and(
                eq(perfTable.drawResultId, targetDraw.id),
                eq(perfTable.gameType, gt)
              )).limit(1);

            if (existing.length > 0) {
              totalSkipped++;
              continue;
            }

            // Run all 18 models on the training data
            const predictions = runAllModels(gameCfg, trainingDraws);

            const resultMainSet = new Set(targetDraw.mainNumbers as number[]);
            const resultSpecialSet = new Set((targetDraw.specialNumbers as number[]) || []);

            // Evaluate each model's prediction against the actual result
            for (const pred of predictions) {
              if (pred.mainNumbers.length === 0) continue;
              const mainHits = pred.mainNumbers.filter((n: number) => resultMainSet.has(n)).length;
              const specialHits = (pred.specialNumbers || []).filter((n: number) => resultSpecialSet.has(n)).length;

              await db.insert(perfTable).values({
                modelName: pred.modelName,
                gameType: gt,
                drawResultId: targetDraw.id,
                predictionId: null,
                mainHits,
                specialHits,
              });
              totalEvaluated++;
            }
          }
        }

        return { evaluated: totalEvaluated, skipped: totalSkipped };
      }),

    /** Get model accuracy trends over time (weekly rolling average) */
    trends: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema.optional(),
        weeksBack: z.number().min(4).max(52).default(12),
      }))
      .query(async ({ input }) => {
        const rows = await getModelTrends(input.gameType, input.weeksBack);
        if (rows.length === 0) return { weeks: [], models: {} as Record<string, Array<{ week: string; avgHits: number; count: number }>> };

        // Collect unique weeks and organize by model
        const weekSet = new Set<string>();
        const modelMap: Record<string, Array<{ week: string; avgHits: number; count: number }>> = {};

        for (const row of rows) {
          const week = row.weekStart;
          weekSet.add(week);
          if (!modelMap[row.modelName]) modelMap[row.modelName] = [];
          modelMap[row.modelName].push({
            week,
            avgHits: Number(Number(row.avgMainHits).toFixed(3)),
            count: Number(row.evaluationCount) || 0,
          });
        }

        const weeks = [...weekSet].sort();
        return { weeks, models: modelMap };
      }),

    /** Get per-model game affinity tags (which games each model excels at) */
    affinity: publicProcedure.query(async () => {
      const { getModelGameAffinity } = await import("./db");
      const affinityData = await getModelGameAffinity();
      return { models: affinityData };
    }),

    /** Get prediction streak data (consecutive draws with 3+ hits) */
    streaks: publicProcedure
      .input(z.object({ minHits: z.number().min(1).max(6).default(3) }))
      .query(async ({ input }) => {
        const { getModelStreaks } = await import("./db");
        const streakData = await getModelStreaks(input.minHits);
        // Separate hot streaks (currently on a streak) from historical
        const hotStreaks = streakData.filter(s => s.isHot);
        const allStreaks = streakData;
        return { hotStreaks, allStreaks };
      }),

    /** Head-to-Head comparison of two models */
    headToHead: publicProcedure
      .input(z.object({
        modelA: z.string(),
        modelB: z.string(),
      }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { modelPerformance } = await import("../drizzle/schema");
        const { sql, eq, inArray } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { modelA: input.modelA, modelB: input.modelB, games: [], summary: null };

        // Per-game stats for both models
        const rows = await db.select({
          modelName: modelPerformance.modelName,
          gameType: modelPerformance.gameType,
          total: sql<number>`COUNT(*)`,
          avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
          avgSpecialHits: sql<number>`AVG(${modelPerformance.specialHits})`,
          maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
          totalMainHits: sql<number>`SUM(${modelPerformance.mainHits})`,
          perfectMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} >= 4 THEN 1 ELSE 0 END)`,
          zeroMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} = 0 THEN 1 ELSE 0 END)`,
        }).from(modelPerformance)
          .where(inArray(modelPerformance.modelName, [input.modelA, input.modelB]))
          .groupBy(modelPerformance.modelName, modelPerformance.gameType);

        // Organize by game
        const gameMap: Record<string, { a: any; b: any }> = {};
        for (const r of rows) {
          const gt = r.gameType;
          if (!gameMap[gt]) gameMap[gt] = { a: null, b: null };
          const stats = {
            total: Number(r.total) || 0,
            avgMainHits: Number(Number(r.avgMainHits).toFixed(3)),
            avgSpecialHits: Number(Number(r.avgSpecialHits).toFixed(3)),
            maxMainHits: Number(r.maxMainHits) || 0,
            totalMainHits: Number(r.totalMainHits) || 0,
            perfectMatches: Number(r.perfectMatches) || 0,
            zeroMatches: Number(r.zeroMatches) || 0,
            consistency: Number(r.total) > 0 ? Number((1 - (Number(r.zeroMatches) || 0) / Number(r.total)).toFixed(3)) : 0,
          };
          if (r.modelName === input.modelA) gameMap[gt].a = stats;
          else gameMap[gt].b = stats;
        }

        const games = Object.entries(gameMap).map(([gameType, { a, b }]) => ({
          gameType,
          gameName: FLORIDA_GAMES[gameType as GameType]?.name || gameType,
          modelA: a || { total: 0, avgMainHits: 0, avgSpecialHits: 0, maxMainHits: 0, totalMainHits: 0, perfectMatches: 0, zeroMatches: 0, consistency: 0 },
          modelB: b || { total: 0, avgMainHits: 0, avgSpecialHits: 0, maxMainHits: 0, totalMainHits: 0, perfectMatches: 0, zeroMatches: 0, consistency: 0 },
          winner: !a && !b ? "tie" : !a ? "b" : !b ? "a" : a.avgMainHits > b.avgMainHits ? "a" : b.avgMainHits > a.avgMainHits ? "b" : "tie",
        }));

        // Overall summary
        const aWins = games.filter(g => g.winner === "a").length;
        const bWins = games.filter(g => g.winner === "b").length;
        const ties = games.filter(g => g.winner === "tie").length;
        const aOverall = games.reduce((s, g) => s + g.modelA.avgMainHits * g.modelA.total, 0);
        const bOverall = games.reduce((s, g) => s + g.modelB.avgMainHits * g.modelB.total, 0);
        const aTotal = games.reduce((s, g) => s + g.modelA.total, 0);
        const bTotal = games.reduce((s, g) => s + g.modelB.total, 0);

        return {
          modelA: input.modelA,
          modelB: input.modelB,
          games,
          summary: {
            aWins, bWins, ties,
            aOverallAvg: aTotal > 0 ? Number((aOverall / aTotal).toFixed(3)) : 0,
            bOverallAvg: bTotal > 0 ? Number((bOverall / bTotal).toFixed(3)) : 0,
            aTotal, bTotal,
            overallWinner: aTotal === 0 && bTotal === 0 ? "tie" : (aTotal > 0 ? aOverall / aTotal : 0) > (bTotal > 0 ? bOverall / bTotal : 0) ? "a" : (bTotal > 0 ? bOverall / bTotal : 0) > (aTotal > 0 ? aOverall / aTotal : 0) ? "b" : "tie",
          },
        };
      }),

    /** Get leaderboard for a specific game */
    byGame: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .query(async ({ input }) => {
        const stats = await getModelPerformanceStats(input.gameType);
        const models = stats.map(s => {
          const total = Number(s.totalPredictions) || 0;
          const avgHits = Number(Number(s.avgMainHits).toFixed(3));
          return {
            modelName: s.modelName,
            totalEvaluated: total,
            avgMainHits: avgHits,
            avgSpecialHits: Number(Number(s.avgSpecialHits).toFixed(3)),
            maxMainHits: Number(s.maxMainHits) || 0,
          };
        }).sort((a, b) => b.avgMainHits - a.avgMainHits);
        return { models, gameType: input.gameType };
      }),
  }),

  // ─── Number Wheel Generator ──────────────────────────────────────────────────
  wheel: router({
    /** Generate wheeling combinations from selected numbers */
    generate: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        selectedNumbers: z.array(z.number()).min(5).max(20),
        wheelType: z.enum(["full", "abbreviated", "key"]),
        keyNumber: z.number().optional(),
        maxTickets: z.number().min(1).max(100).default(50),
      }))
      .mutation(({ input }) => {
        const cfg = FLORIDA_GAMES[input.gameType];
        if (cfg.isDigitGame) {
          return { tickets: [], totalCost: 0, coverage: 0, error: "Wheeling is not available for digit games." };
        }

        const nums = [...input.selectedNumbers].sort((a, b) => a - b);
        const pick = cfg.mainCount;
        let combos: number[][] = [];

        if (input.wheelType === "full") {
          // Full wheel: every possible combination of pick from selected numbers
          combos = generateCombinations(nums, pick);
        } else if (input.wheelType === "abbreviated") {
          // Abbreviated wheel: balanced coverage with fewer tickets
          combos = generateAbbreviatedWheel(nums, pick);
        } else if (input.wheelType === "key") {
          // Key number wheel: one number appears in every combination
          const key = input.keyNumber ?? nums[0];
          const remaining = nums.filter(n => n !== key);
          const subCombos = generateCombinations(remaining, pick - 1);
          combos = subCombos.map(c => [key, ...c].sort((a, b) => a - b));
        }

        // Limit to maxTickets
        if (combos.length > input.maxTickets) {
          combos = combos.slice(0, input.maxTickets);
        }

        // Calculate coverage: what % of possible combinations from the selected pool are covered
        const totalPossible = nCr(nums.length, pick);
        const coverage = totalPossible > 0 ? (combos.length / totalPossible) * 100 : 0;

        // Generate special numbers for each ticket from historical frequency
        const tickets = combos.map((main, i) => ({
          mainNumbers: main,
          specialNumbers: [] as number[], // User can add their own
          ticketNumber: i + 1,
        }));

        return {
          tickets,
          totalCost: combos.length * cfg.ticketPrice,
          coverage: Number(coverage.toFixed(1)),
          totalPossibleCombos: totalPossible,
          wheelType: input.wheelType,
        };
      }),

    /** Smart Wheel: get consensus numbers from all 18 models for auto-populating the wheel */
    smartNumbers: publicProcedure
      .input(z.object({ gameType: gameTypeSchema, count: z.number().min(5).max(20).default(8) }))
      .mutation(async ({ input }) => {
        const cfg = FLORIDA_GAMES[input.gameType];
        if (cfg.isDigitGame) {
          return { numbers: [] as number[], modelVotes: {} as Record<number, { count: number; weightedScore: number; models: string[] }>, error: "Smart Wheel is not available for digit games." };
        }

        // Get historical data
        const historyRows = await getDrawResults(input.gameType, 200);
        const history = historyRows.map(r => ({
          mainNumbers: r.mainNumbers as number[],
          specialNumbers: (r.specialNumbers as number[]) || [],
          drawDate: r.drawDate,
        }));

        if (history.length < 10) {
          return { numbers: [] as number[], modelVotes: {} as Record<number, { count: number; weightedScore: number; models: string[] }>, error: "Need at least 10 historical draws. Use Bulk History in Admin to load data." };
        }

        // Run all 18 models
        const modelWeights = await getModelWeights(input.gameType);
        const allResults = runAllModels(cfg, history, modelWeights);

        // Tally votes: count how many models picked each number, weighted by confidence
        const votes = new Map<number, { count: number; weightedScore: number; models: string[] }>();
        for (const pred of allResults) {
          if (pred.mainNumbers.length === 0 || pred.metadata?.insufficient_data) continue;
          for (const n of pred.mainNumbers) {
            const existing = votes.get(n) || { count: 0, weightedScore: 0, models: [] };
            existing.count += 1;
            existing.weightedScore += pred.confidenceScore;
            existing.models.push(pred.modelName);
            votes.set(n, existing);
          }
        }

        // Rank by weighted score (confidence * frequency across models)
        const ranked = [...votes.entries()]
          .sort((a, b) => b[1].weightedScore - a[1].weightedScore);

        // Take top N numbers
        const topNumbers = ranked.slice(0, input.count).map(e => e[0]).sort((a, b) => a - b);

        // Build model vote summary for UI display
        const modelVotes: Record<number, { count: number; weightedScore: number; models: string[] }> = {};
        for (const [num, data] of ranked.slice(0, input.count)) {
          modelVotes[num] = {
            count: data.count,
            weightedScore: Math.round(data.weightedScore * 100) / 100,
            models: data.models,
          };
        }

        const validModels = allResults.filter(p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data).length;

        return {
          numbers: topNumbers,
          modelVotes,
          totalModelsUsed: validModels,
          totalModels: allResults.length,
          historyUsed: history.length,
        };
      }),
  }),

  // ─── Draw Schedule & Countdown ─────────────────────────────────────────────
  schedule: router({
    /** Get draw schedule and next draw info for all games */
    all: publicProcedure.query(() => {
      const schedules = GAME_TYPES.map(gt => {
        const cfg = FLORIDA_GAMES[gt];
        const nextDraw = getNextDrawDate(gt);
        return {
          gameType: gt,
          gameName: cfg.name,
          schedule: cfg.schedule,
          nextDraw: nextDraw ? nextDraw.toISOString() : null,
          countdown: nextDraw ? formatTimeUntil(nextDraw) : cfg.schedule.ended ? "Game ended" : "Unknown",
          ticketPrice: cfg.ticketPrice,
        };
      });
      return schedules;
    }),

    /** Get next draw info for a specific game */
    next: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .query(({ input }) => {
        const cfg = FLORIDA_GAMES[input.gameType];
        const nextDraw = getNextDrawDate(input.gameType);
        return {
          gameType: input.gameType,
          gameName: cfg.name,
          schedule: cfg.schedule,
          nextDraw: nextDraw ? nextDraw.toISOString() : null,
          countdown: nextDraw ? formatTimeUntil(nextDraw) : cfg.schedule.ended ? "Game ended" : "Unknown",
        };
      }),

    /** Get data health: how many draws we have per game */
    dataHealth: publicProcedure.query(async () => {
      const health = await Promise.all(
        GAME_TYPES.map(async (gt) => ({
          gameType: gt,
          gameName: FLORIDA_GAMES[gt].name,
          drawCount: await getDrawResultCount(gt),
        }))
      );
      return health;
    }),
  }),

  // ─── LLM Analysis ──────────────────────────────────────────────────────────
  analysis: router({
    /** Get LLM-powered analysis of predictions and patterns */
    generate: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        analysisType: z.enum(["model_performance", "pattern_analysis", "strategy_recommendation"]),
      }))
      .mutation(async ({ input }) => {
        const cfg = FLORIDA_GAMES[input.gameType];
        const historyRows = await getDrawResults(input.gameType, 50);
        const perfStats = await getModelPerformanceStats(input.gameType);
        const modelWeights = await getModelWeights(input.gameType);

        const historyStr = historyRows.slice(0, 20).map(r => {
          const nums = r.mainNumbers as number[];
          const special = r.specialNumbers as number[] | null;
          return `${new Date(r.drawDate).toLocaleDateString()}: ${nums.join(", ")}${special && special.length > 0 ? ` | Special: ${special.join(", ")}` : ""}`;
        }).join("\n");

        const perfStr = perfStats.map(s =>
          `${s.modelName}: ${s.totalPredictions} predictions, avg ${Number(s.avgMainHits).toFixed(1)} main hits, max ${s.maxMainHits}`
        ).join("\n");

        const weightsStr = Object.entries(modelWeights).map(([m, w]) =>
          `${m}: weight ${(w * 100).toFixed(0)}%`
        ).join("\n");

        const prompts: Record<string, string> = {
          model_performance: `You are a lottery analytics expert. Analyze the performance of these prediction models for ${cfg.name}:\n\nModel Performance:\n${perfStr || "No performance data yet."}\n\nCurrent Model Weights (from accuracy tracking):\n${weightsStr || "No weights calculated yet — need more data."}\n\nRecent Draw History:\n${historyStr || "No draw history yet."}\n\nExplain which models performed best and why. Discuss how the auto-weighting system is adjusting. Be specific about statistical patterns. Keep the response concise (3-4 paragraphs).`,
          pattern_analysis: `You are a lottery number pattern analyst. Analyze the recent draw history for ${cfg.name}:\n\nRecent Draws:\n${historyStr || "No draw history yet."}\n\nIdentify any notable patterns: hot/cold numbers, number gaps, frequency distributions, consecutive number patterns, sum ranges, and odd/even distributions. Keep the response concise (3-4 paragraphs).`,
          strategy_recommendation: `You are a lottery strategy advisor. Based on the following data for ${cfg.name}, provide personalized betting strategy recommendations:\n\nRecent Draws:\n${historyStr || "No draw history yet."}\n\nModel Performance:\n${perfStr || "No performance data yet."}\n\nModel Weights:\n${weightsStr || "No weights yet."}\n\nBudget constraint: $75 per drawing cycle, 20 tickets maximum.\nProvide specific, actionable recommendations for ticket selection strategy. Include which models to trust more based on their accuracy weights and how to diversify. Keep the response concise (3-4 paragraphs).`,
        };

        // Check if LLM API key is configured before attempting
        const hasApiKey = Boolean(ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0);
        let providerAttempted = false;
        let fallbackUsed = false;

        if (!hasApiKey) {
          console.warn("[Analysis] No LLM API key configured — returning fallback text");
          fallbackUsed = true;
          return {
            analysis: "Analysis is temporarily unavailable. Please configure the LLM API key (BUILT_IN_FORGE_API_KEY) to enable AI-powered analysis.",
            analysisType: input.analysisType,
            gameType: input.gameType,
            observability: { providerAttempted, fallbackUsed },
          };
        }

        try {
          providerAttempted = true;
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are an expert lottery analytics assistant. Provide clear, data-driven analysis. Use markdown formatting for readability. Always include a disclaimer that lottery outcomes are random and no prediction system can guarantee wins." },
              { role: "user", content: prompts[input.analysisType] },
            ],
          });

          const content = result.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

          return {
            analysis: text,
            analysisType: input.analysisType,
            gameType: input.gameType,
            observability: { providerAttempted, fallbackUsed },
          };
        } catch (e) {
          console.error("[Analysis] LLM call failed:", e);
          fallbackUsed = true;
          return {
            analysis: "Analysis is temporarily unavailable. Please try again later.",
            analysisType: input.analysisType,
            gameType: input.gameType,
            observability: { providerAttempted, fallbackUsed },
          };
        }
      }),
  }),

  // ─── Favorites ─────────────────────────────────────────────────────────────────
  favorites: router({
    /** List user's favorites, optionally filtered by game */
    list: protectedProcedure
      .input(z.object({ gameType: gameTypeSchema.optional() }).optional())
      .query(async ({ ctx, input }) => {
        return getUserFavorites(ctx.user.id, input?.gameType);
      }),

    /** Add a number combination to favorites */
    add: protectedProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        label: z.string().max(128).optional(),
        mainNumbers: z.array(z.number()),
        specialNumbers: z.array(z.number()).default([]),
        modelSource: z.string().optional(),
        confidence: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await addFavorite({
          userId: ctx.user.id,
          gameType: input.gameType,
          label: input.label || null,
          mainNumbers: input.mainNumbers,
          specialNumbers: input.specialNumbers,
          modelSource: input.modelSource || null,
          confidence: input.confidence || null,
        });
        return { success: true };
      }),

    /** Remove a favorite */
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeFavorite(input.id, ctx.user.id);
        return { success: true };
      }),

    /** Increment usage count when a favorite is re-used */
    use: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await incrementFavoriteUsage(input.id);
        return { success: true };
      }),
  }),

  // ─── Push Notifications ─────────────────────────────────────────────────────────
  push: router({
    /** Get current push subscription status */
    status: protectedProcedure
      .query(async ({ ctx }) => {
        const sub = await getUserPushSubscription(ctx.user.id);
        return {
          subscribed: !!sub,
          enabled: sub?.enabled === 1,
          notifyDrawResults: sub?.notifyDrawResults === 1,
          notifyHighAccuracy: sub?.notifyHighAccuracy === 1,
        };
      }),

    /** Subscribe to push notifications */
    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string(),
        p256dh: z.string(),
        auth: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertPushSubscription({
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          enabled: 1,
          notifyDrawResults: 1,
          notifyHighAccuracy: 1,
        });
        return { success: true };
      }),

    /** Update notification preferences */
    updatePreferences: protectedProcedure
      .input(z.object({
        enabled: z.boolean().optional(),
        notifyDrawResults: z.boolean().optional(),
        notifyHighAccuracy: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const prefs: Record<string, number> = {};
        if (input.enabled !== undefined) prefs.enabled = input.enabled ? 1 : 0;
        if (input.notifyDrawResults !== undefined) prefs.notifyDrawResults = input.notifyDrawResults ? 1 : 0;
        if (input.notifyHighAccuracy !== undefined) prefs.notifyHighAccuracy = input.notifyHighAccuracy ? 1 : 0;
        await updatePushPreferences(ctx.user.id, prefs);
        return { success: true };
      }),

    /** Unsubscribe from push notifications */
    unsubscribe: protectedProcedure
      .mutation(async ({ ctx }) => {
        await updatePushPreferences(ctx.user.id, { enabled: 0 });
        return { success: true };
      }),
  }),

  // ─── Export Tickets to PDF ─────────────────────────────────────────────────
  export: router({
    /** Generate a printable PDF of ticket selections */
    ticketsPdf: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        gameName: z.string(),
        tickets: z.array(z.object({
          mainNumbers: z.array(z.number()),
          specialNumbers: z.array(z.number()),
          modelSource: z.string(),
          confidence: z.number(),
        })),
        budget: z.number(),
        totalCost: z.number(),
      }))
      .mutation(async ({ input }) => {
        // Return structured data for client-side PDF generation
        // The client will render the PDF using canvas/HTML
        const drawDate = new Date();
        return {
          gameName: input.gameName,
          gameType: input.gameType,
          tickets: input.tickets,
          budget: input.budget,
          totalCost: input.totalCost,
          generatedAt: drawDate.toISOString(),
          ticketCount: input.tickets.length,
        };
      }),
  }),

  // ─── Results vs Predictions Comparison ─────────────────────────────────────
  compare: router({
    /** Get recent predictions with their actual draw results and hit/miss analysis */
    results: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ input }) => {
        const drawRows = await getDrawResults(input.gameType, input.limit);
        const perfStats = await getModelPerformanceStats(input.gameType);

        // Build comparison data: for each draw, find predictions that were evaluated against it
        const comparisons = drawRows.map(draw => {
          const mainNums = draw.mainNumbers as number[];
          const specialNums = (draw.specialNumbers as number[]) || [];
          return {
            drawId: draw.id,
            gameType: draw.gameType,
            drawDate: draw.drawDate,
            drawTime: draw.drawTime,
            mainNumbers: mainNums,
            specialNumbers: specialNums,
          };
        });

        // Build model summary from performance stats
        const modelSummary = perfStats.map(s => ({
          modelName: s.modelName,
          totalEvaluated: Number(s.totalPredictions) || 0,
          avgMainHits: Number(Number(s.avgMainHits).toFixed(2)),
          avgSpecialHits: Number(Number(s.avgSpecialHits).toFixed(2)),
          maxMainHits: Number(s.maxMainHits) || 0,
        }));

        return { comparisons, modelSummary, gameType: input.gameType };
      }),

    /** Get detailed hit/miss for a specific draw across all models */
    drawDetail: publicProcedure
      .input(z.object({ drawId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { modelPerformance, drawResults, predictions } = await import("../drizzle/schema");
        const { eq, inArray } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { draw: null, modelResults: [] };

        // Get the draw
        const drawRow = await db.select().from(drawResults).where(eq(drawResults.id, input.drawId)).limit(1);
        if (drawRow.length === 0) return { draw: null, modelResults: [] };
        const draw = drawRow[0];

        // Get all performance records for this draw
        const perfRows = await db.select({
          modelName: modelPerformance.modelName,
          mainHits: modelPerformance.mainHits,
          specialHits: modelPerformance.specialHits,
          predictionId: modelPerformance.predictionId,
        }).from(modelPerformance)
          .where(eq(modelPerformance.drawResultId, input.drawId));

        // Collect all non-null predictionIds
        const predictionIds = perfRows
          .map(p => p.predictionId)
          .filter((id): id is number => id !== null && id !== undefined);

        // BATCHED: single query replaces N+1 pattern (one query per model row)
        const predictionRows = predictionIds.length > 0
          ? await db.select().from(predictions)
              .where(inArray(predictions.id, predictionIds))
          : [];

        // Build an in-memory lookup map
        const predMap = new Map<number, { main: number[]; special: number[] }>();
        for (const row of predictionRows) {
          predMap.set(row.id, {
            main: row.mainNumbers as number[],
            special: (row.specialNumbers as number[]) || [],
          });
        }

        // Synchronous map using the lookup
        const modelResults = perfRows.map((perf) => {
          const predNumbers = perf.predictionId
            ? predMap.get(perf.predictionId) ?? { main: [], special: [] }
            : { main: [], special: [] };
          return {
            modelName: perf.modelName,
            mainHits: perf.mainHits,
            specialHits: perf.specialHits,
            predictedMain: predNumbers.main,
            predictedSpecial: predNumbers.special,
          };
        });

        return {
          draw: {
            id: draw.id,
            gameType: draw.gameType,
            drawDate: draw.drawDate,
            mainNumbers: draw.mainNumbers as number[],
            specialNumbers: (draw.specialNumbers as number[]) || [],
          },
          modelResults: modelResults.sort((a, b) => b.mainHits - a.mainHits),
        };
      }),
  }),

  // ─── CSV Export ──────────────────────────────────────────────────────────────
  csvExport: router({
    /** Export draw results as CSV */
    drawResults: publicProcedure
      .input(z.object({
        gameType: gameTypeSchema.optional(),
        limit: z.number().min(1).max(5000).default(500),
      }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { drawResults: drawsTable } = await import("../drizzle/schema");
        const { eq, desc: descOp } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { csv: "", count: 0 };

        const conditions = input.gameType ? eq(drawsTable.gameType, input.gameType) : undefined;
        const rows = conditions
          ? await db.select().from(drawsTable).where(conditions).orderBy(descOp(drawsTable.drawDate)).limit(input.limit)
          : await db.select().from(drawsTable).orderBy(descOp(drawsTable.drawDate)).limit(input.limit);

        // Build CSV
        const headers = ["Date", "Game", "Draw Time", "Main Numbers", "Special Numbers", "Source"];
        const csvRows = rows.map(r => {
          const date = new Date(r.drawDate).toLocaleDateString("en-US");
          const game = FLORIDA_GAMES[r.gameType as GameType]?.name || r.gameType;
          const mainNums = (r.mainNumbers as number[]).join(" - ");
          const specialNums = r.specialNumbers ? (r.specialNumbers as number[]).join(" - ") : "";
          return [date, game, r.drawTime || "evening", mainNums, specialNums, r.source || "manual"].map(v => `"${v}"`).join(",");
        });

        const csv = [headers.join(","), ...csvRows].join("\n");
        return { csv, count: rows.length };
      }),

    /** Export prediction history as CSV */
    predictions: protectedProcedure
      .input(z.object({
        gameType: gameTypeSchema.optional(),
        limit: z.number().min(1).max(5000).default(500),
      }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { predictions: predsTable } = await import("../drizzle/schema");
        const { eq, and, desc: descOp } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return { csv: "", count: 0 };

        const conditions = [eq(predsTable.userId, ctx.user.id)];
        if (input.gameType) conditions.push(eq(predsTable.gameType, input.gameType));

        const rows = await db.select().from(predsTable)
          .where(and(...conditions))
          .orderBy(descOp(predsTable.createdAt))
          .limit(input.limit);

        const headers = ["Date", "Game", "Model", "Main Numbers", "Special Numbers", "Confidence"];
        const csvRows = rows.map(r => {
          const date = new Date(r.createdAt).toLocaleString("en-US");
          const game = FLORIDA_GAMES[r.gameType as GameType]?.name || r.gameType;
          const mainNums = (r.mainNumbers as number[]).join(" - ");
          const specialNums = r.specialNumbers ? (r.specialNumbers as number[]).join(" - ") : "";
          const confidence = Math.round(r.confidenceScore * 100) + "%";
          return [date, game, r.modelName, mainNums, specialNums, confidence].map(v => `"${v}"`).join(",");
        });

        const csv = [headers.join(","), ...csvRows].join("\n");
        return { csv, count: rows.length };
      }),
  }),

  // ─── Data Fetch (auto-fetch lottery results from official FL Lottery files) ──
  dataFetch: router({
    /** Get auto-fetch cron status */
    autoFetchStatus: publicProcedure.query(() => {
      const lastResult = getLastAutoFetchResult();
      return {
        isScheduleActive: isAutoFetchActive(),
        isRunning: getAutoFetchRunning(),
        lastRun: lastResult ? {
          timestamp: lastResult.timestamp,
          gamesProcessed: lastResult.gamesProcessed,
          totalNewDraws: lastResult.totalNewDraws,
          totalEvaluations: lastResult.totalEvaluations,
          highAccuracyAlerts: lastResult.highAccuracyAlerts,
          gameResults: lastResult.gameResults,
          errors: lastResult.errors,
        } : null,
      };
    }),

    /** Manually trigger auto-fetch (admin only) */
    triggerAutoFetch: adminProcedure.mutation(async () => {
      const result = await runAutoFetch();
      return result;
    }),

    /** Fetch latest results for a single game from lotteryusa.com */
    fetchLatest: adminProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .mutation(async ({ input }) => {
        try {
          const draws = await fetchRecentDraws(input.gameType as GameType);
          let insertedCount = 0;
          const errors: string[] = [];

          for (const draw of draws) {
            try {
              const insertResult = await insertDrawResult({
                gameType: input.gameType,
                drawDate: new Date(draw.drawDate).getTime(),
                mainNumbers: draw.mainNumbers,
                specialNumbers: draw.specialNumbers,
                drawTime: draw.drawTime,
                source: "lotteryusa.com",
              });
              if (insertResult.status === "inserted") {
                insertedCount++;

                // Auto-evaluate predictions against this new draw
                const drawId = insertResult.insertId;
                if (drawId) {
                  const evalResult = await evaluatePredictionsAgainstDraw(
                    drawId, input.gameType, draw.mainNumbers, draw.specialNumbers
                  );
                  if (evalResult.highAccuracy > 3) {
                    await notifyOwner({
                      title: "High Prediction Accuracy Detected",
                      content: `${evalResult.highAccuracy} predictions matched 60%+ of ${FLORIDA_GAMES[input.gameType].name} draw on ${draw.drawDate}. ${evalResult.evaluated} predictions evaluated.`,
                    });
                  }
                }
              }
              // status === "duplicate" is silently skipped — this is expected behavior
            } catch (e) {
              // Duplicates are handled via insertDrawResult's return status.
              // Only genuine unexpected failures reach this catch block.
              console.error("[DataFetch] Unexpected insert error:", e);
              errors.push(e instanceof Error ? e.message : String(e));
            }
          }

          return { success: true, data: { draws }, insertedCount, errors };
        } catch (e) {
          console.error("[DataFetch] fetchLatest failed:", e);
          return { success: false, data: null, insertedCount: 0, errors: [e instanceof Error ? e.message : String(e)] };
        }
      }),

    /** Fetch latest results for ALL games at once from lotteryusa.com */
    fetchAll: adminProcedure
      .mutation(async () => {
        const results: Record<string, { success: boolean; count: number }> = {};
        const errors: string[] = [];

        try {
          const allGames = await fetchAllGamesRecent();

          for (const [gt, draws] of Object.entries(allGames)) {
            if (!FLORIDA_GAMES[gt as GameType]) continue;
            let count = 0;
            for (const draw of draws) {
              try {
                const insertResult = await insertDrawResult({
                  gameType: gt,
                  drawDate: new Date(draw.drawDate).getTime(),
                  mainNumbers: draw.mainNumbers,
                  specialNumbers: draw.specialNumbers,
                  drawTime: draw.drawTime,
                  source: "lotteryusa.com",
                });
                if (insertResult.status === "inserted") {
                  count++;

                  const drawId = insertResult.insertId;
                  if (drawId) {
                    const evalResult = await evaluatePredictionsAgainstDraw(
                      drawId, gt, draw.mainNumbers, draw.specialNumbers
                    );
                    if (evalResult.highAccuracy > 3) {
                      await notifyOwner({
                        title: "High Prediction Accuracy Detected",
                        content: `${evalResult.highAccuracy} predictions matched 60%+ of ${FLORIDA_GAMES[gt as GameType].name} draw on ${draw.drawDate}.`,
                      });
                    }
                  }
                }
                // status === "duplicate" is silently skipped — this is expected behavior
              } catch (e) {
                // Duplicates are handled via insertDrawResult's return status.
                // Only genuine unexpected failures reach this catch block.
                console.error("[DataFetch] Unexpected insert error:", e);
                errors.push(e instanceof Error ? e.message : String(e));
              }
            }
            results[gt] = { success: true, count };
          }
        } catch (e) {
          console.error("[DataFetch] fetchAll failed:", e);
          errors.push(e instanceof Error ? e.message : String(e));
        }

        return { success: true, results, errors };
      }),

    /** Get user's PDF upload history */
    pdfUploads: protectedProcedure
      .query(async ({ ctx }) => {
        return getUserPdfUploads(ctx.user.id);
      }),

    /** Fetch bulk historical data for a game (parses full history from FL Lottery) */
    fetchHistory: adminProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        drawCount: z.number().min(10).max(5000).default(200),
      }))
      .mutation(async ({ input }) => {
        try {
          const cfg = FLORIDA_GAMES[input.gameType];
          const draws = await fetchHistoricalDraws(input.gameType as GameType, input.drawCount);
          let insertedCount = 0;
          let skippedCount = 0;
          const errors: string[] = [];

          for (const draw of draws) {
            try {
              const insertResult = await insertDrawResult({
                gameType: input.gameType,
                drawDate: new Date(draw.drawDate).getTime(),
                mainNumbers: draw.mainNumbers,
                specialNumbers: draw.specialNumbers,
                drawTime: draw.drawTime,
                source: "lotteryusa.com",
              });
              if (insertResult.status === "inserted") {
                insertedCount++;
              }
              // status === "duplicate" is silently skipped — this is expected behavior
              if (insertResult.status === "duplicate") {
                skippedCount++;
              }
            } catch (e) {
              // Duplicates are handled via insertDrawResult's return status.
              // Only genuine unexpected failures reach this catch block.
              console.error("[DataFetch] Unexpected insert error:", e);
              errors.push(e instanceof Error ? e.message : String(e));
              skippedCount++;
            }
          }

          if (insertedCount > 10) {
            await notifyOwner({
              title: "Historical Data Loaded",
              content: `Loaded ${insertedCount} historical draws for ${cfg.name}. ${skippedCount} duplicates skipped. Total found: ${draws.length}. Prediction models now have more data.`,
            });
          }

          return { success: true, insertedCount, skippedCount, totalFound: draws.length, errors };
        } catch (e) {
          console.error("[DataFetch] fetchHistory failed:", e);
          return { success: false, insertedCount: 0, skippedCount: 0, totalFound: 0, errors: [e instanceof Error ? e.message : String(e)] };
        }
      }),
  }),

  // ─── Win/Loss Tracker ──────────────────────────────────────────────────────
  tracker: router({
    /** Log a purchased ticket */
    logPurchase: protectedProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        mainNumbers: z.array(z.number()),
        specialNumbers: z.array(z.number()).optional(),
        purchaseDate: z.number(),
        drawDate: z.number().optional(),
        cost: z.number().min(0),
        notes: z.string().optional(),
        modelSource: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await insertPurchasedTicket({
          userId: ctx.user.id,
          gameType: input.gameType,
          mainNumbers: input.mainNumbers,
          specialNumbers: input.specialNumbers || [],
          purchaseDate: input.purchaseDate,
          drawDate: input.drawDate,
          cost: input.cost,
          notes: input.notes,
          modelSource: input.modelSource,
        });
        return { success: true, id };
      }),

    /** Log multiple purchased tickets at once (e.g., from budget selection) */
    logBulkPurchase: protectedProcedure
      .input(z.object({
        tickets: z.array(z.object({
          gameType: gameTypeSchema,
          mainNumbers: z.array(z.number()),
          specialNumbers: z.array(z.number()).optional(),
          cost: z.number().min(0),
          modelSource: z.string().optional(),
        })),
        purchaseDate: z.number(),
        drawDate: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        let count = 0;
        for (const ticket of input.tickets) {
          try {
            await insertPurchasedTicket({
              userId: ctx.user.id,
              gameType: ticket.gameType,
              mainNumbers: ticket.mainNumbers,
              specialNumbers: ticket.specialNumbers || [],
              purchaseDate: input.purchaseDate,
              drawDate: input.drawDate,
              cost: ticket.cost,
              modelSource: ticket.modelSource,
            });
            count++;
          } catch (e) {
            console.warn("[Tracker] Failed to log ticket:", e);
          }
        }
        return { success: true, count };
      }),

    /** Update a ticket's outcome (win/loss) */
    updateOutcome: protectedProcedure
      .input(z.object({
        id: z.number(),
        outcome: z.enum(["pending", "loss", "win"]),
        winAmount: z.number().optional(),
        mainHits: z.number().optional(),
        specialHits: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updatePurchasedTicketOutcome(
          input.id, ctx.user.id, input.outcome,
          input.winAmount, input.mainHits, input.specialHits
        );
        return { success: true };
      }),

    /** Delete a purchased ticket */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deletePurchasedTicket(input.id, ctx.user.id);
        return { success: true };
      }),

    /** Get user's purchased tickets */
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
      .query(async ({ ctx, input }) => {
        return getUserPurchasedTickets(ctx.user.id, input.limit);
      }),

    /** Get user's ROI stats */
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        return getUserROIStats(ctx.user.id);
      }),

    /** Get ROI broken down by game */
    statsByGame: protectedProcedure
      .query(async ({ ctx }) => {
        return getROIByGame(ctx.user.id);
      }),
   }),

  // ─── Patterns & Streaks ──────────────────────────────────────────────────────
  patterns: router({
    /** Full pattern analysis for a game: frequency, streaks, overdue, pairs */
    analyze: publicProcedure
      .input(z.object({ gameType: gameTypeSchema, lookback: z.number().min(10).max(500).default(100) }))
      .query(async ({ input }) => {
        const draws = await getDrawResults(input.gameType, input.lookback);
        const cfg = FLORIDA_GAMES[input.gameType];
        if (draws.length === 0) return { frequency: [], streaks: [], overdue: [], pairs: [], drawCount: 0 };

        const allMain = draws.map(d => (d.mainNumbers as number[]));
        const allSpecial = draws.map(d => (d.specialNumbers as number[]));
        const pool = range(1, cfg.mainMax);

        // --- Frequency analysis ---
        const freqMap = new Map<number, number>();
        for (const nums of allMain) for (const n of nums) freqMap.set(n, (freqMap.get(n) || 0) + 1);
        const frequency = pool.map(n => ({
          number: n,
          count: freqMap.get(n) || 0,
          percentage: ((freqMap.get(n) || 0) / draws.length) * 100,
        })).sort((a, b) => b.count - a.count);

        // --- Hot/Cold streaks ---
        const streaks: Array<{ number: number; currentStreak: number; streakType: "hot" | "cold"; maxHotStreak: number; maxColdStreak: number }> = [];
        for (const n of pool) {
          let currentStreak = 0;
          let streakType: "hot" | "cold" = "cold";
          let maxHot = 0, maxCold = 0, tempHot = 0, tempCold = 0;
          // draws are newest-first from DB, reverse for chronological
          const chronological = [...allMain].reverse();
          for (const nums of chronological) {
            if (nums.includes(n)) {
              tempHot++;
              if (tempCold > maxCold) maxCold = tempCold;
              tempCold = 0;
            } else {
              tempCold++;
              if (tempHot > maxHot) maxHot = tempHot;
              tempHot = 0;
            }
          }
          if (tempHot > maxHot) maxHot = tempHot;
          if (tempCold > maxCold) maxCold = tempCold;
          // Current streak from most recent draws
          const recentFirst = allMain;
          if (recentFirst[0]?.includes(n)) {
            streakType = "hot";
            for (const nums of recentFirst) {
              if (nums.includes(n)) currentStreak++;
              else break;
            }
          } else {
            streakType = "cold";
            for (const nums of recentFirst) {
              if (!nums.includes(n)) currentStreak++;
              else break;
            }
          }
          streaks.push({ number: n, currentStreak, streakType, maxHotStreak: maxHot, maxColdStreak: maxCold });
        }
        streaks.sort((a, b) => b.currentStreak - a.currentStreak);

        // --- Overdue numbers ---
        const overdue = pool.map(n => {
          let gap = draws.length;
          for (let i = 0; i < allMain.length; i++) {
            if (allMain[i].includes(n)) { gap = i; break; }
          }
          return { number: n, drawsSinceLastAppearance: gap, averageGap: draws.length / Math.max(1, freqMap.get(n) || 1) };
        }).sort((a, b) => b.drawsSinceLastAppearance - a.drawsSinceLastAppearance);

        // --- Top pairs (co-occurrence) ---
        const pairMap = new Map<string, number>();
        for (const nums of allMain) {
          for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
              const key = `${Math.min(nums[i], nums[j])}-${Math.max(nums[i], nums[j])}`;
              pairMap.set(key, (pairMap.get(key) || 0) + 1);
            }
          }
        }
        const pairs = [...pairMap.entries()]
          .map(([key, count]) => {
            const [a, b] = key.split("-").map(Number);
            return { numberA: a, numberB: b, count, percentage: (count / draws.length) * 100 };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 20);

        // --- Special number frequency (if applicable) ---
        let specialFrequency: Array<{ number: number; count: number; percentage: number }> = [];
        if (cfg.specialCount > 0) {
          const specPool = range(1, cfg.specialMax);
          const specFreqMap = new Map<number, number>();
          for (const nums of allSpecial) for (const n of nums) specFreqMap.set(n, (specFreqMap.get(n) || 0) + 1);
          specialFrequency = specPool.map(n => ({
            number: n,
            count: specFreqMap.get(n) || 0,
            percentage: ((specFreqMap.get(n) || 0) / draws.length) * 100,
          })).sort((a, b) => b.count - a.count);
        }

        return { frequency, streaks, overdue, pairs, specialFrequency, drawCount: draws.length };
      }),

    /** Heatmap: returns a grid of which numbers appeared on which dates */
    heatmap: publicProcedure
      .input(z.object({ gameType: gameTypeSchema, lookback: z.number().min(10).max(500).default(100) }))
      .query(async ({ input }) => {
        const draws = await getDrawResults(input.gameType, input.lookback);
        const cfg = FLORIDA_GAMES[input.gameType];
        if (draws.length === 0) return { grid: [], numbers: [], dates: [], drawCount: 0 };

        // Build date -> numbers map
        const dateMap: Array<{ date: string; numbers: number[]; specialNumbers: number[] }> = [];
        for (const draw of draws) {
          const dateStr = new Date(draw.drawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
          const drawTime = draw.drawTime || "evening";
          const label = draws.some(d => d.drawDate === draw.drawDate && d.id !== draw.id)
            ? `${dateStr} (${drawTime})`
            : dateStr;
          dateMap.push({
            date: label,
            numbers: draw.mainNumbers as number[],
            specialNumbers: (draw.specialNumbers as number[]) || [],
          });
        }

        // Limit to most recent 50 dates for readability
        const recentDates = dateMap.slice(0, 50);
        const dates = recentDates.map(d => d.date);

        // Build number pool
        const pool = range(1, cfg.mainMax);

        // Build grid: for each number, for each date, was it drawn?
        const grid = pool.map(num => ({
          number: num,
          hits: recentDates.map(d => d.numbers.includes(num)),
          totalHits: recentDates.filter(d => d.numbers.includes(num)).length,
        }));

        // Also compute "hot zones" - clusters of consecutive appearances
        const hotNumbers = grid
          .map(g => {
            let maxConsecutive = 0, current = 0;
            for (const hit of g.hits) {
              if (hit) { current++; maxConsecutive = Math.max(maxConsecutive, current); }
              else current = 0;
            }
            return { number: g.number, totalHits: g.totalHits, maxConsecutive };
          })
          .sort((a, b) => b.totalHits - a.totalHits);

        return { grid, dates, numbers: pool, hotNumbers, drawCount: draws.length, dateCount: recentDates.length };
      }),
  }),
});

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** Generate all combinations of size k from array */
function generateCombinations(arr: number[], k: number): number[][] {
  const result: number[][] = [];
  function backtrack(start: number, current: number[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/** Generate abbreviated wheel: balanced coverage with fewer tickets.
 *  Uses a round-robin approach to ensure each number appears roughly equally. */
function generateAbbreviatedWheel(nums: number[], pick: number): number[][] {
  const n = nums.length;
  if (n <= pick) return [nums.slice(0, pick)];

  const result: number[][] = [];
  const usageCount = new Map<number, number>();
  for (const num of nums) usageCount.set(num, 0);

  // Target: each number appears in roughly the same number of tickets
  // Generate tickets by picking the least-used numbers first
  const maxTickets = Math.min(nCr(n, pick), n * 3); // cap at 3x the number pool
  const seen = new Set<string>();

  for (let t = 0; t < maxTickets; t++) {
    // Sort numbers by usage (least used first), break ties by number value
    const sorted = [...nums].sort((a, b) => {
      const diff = (usageCount.get(a) || 0) - (usageCount.get(b) || 0);
      return diff !== 0 ? diff : a - b;
    });

    // Take the first 'pick' least-used numbers
    const ticket = sorted.slice(0, pick).sort((a, b) => a - b);
    const key = ticket.join(",");

    if (seen.has(key)) {
      // Try shifting to avoid duplicates
      const shifted = sorted.slice(1, pick + 1).sort((a, b) => a - b);
      const shiftedKey = shifted.join(",");
      if (!seen.has(shiftedKey) && shifted.length === pick) {
        seen.add(shiftedKey);
        result.push(shifted);
        for (const num of shifted) usageCount.set(num, (usageCount.get(num) || 0) + 1);
      }
      continue;
    }

    seen.add(key);
    result.push(ticket);
    for (const num of ticket) usageCount.set(num, (usageCount.get(num) || 0) + 1);
  }

  return result;
}

/** Calculate n choose r (combinations) */
function nCr(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

export type AppRouter = typeof appRouter;
