import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, getNextDrawDate, formatTimeUntil } from "@shared/lottery";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { fetchHistoricalDraws } from "./lib/fl-lottery-scraper";
import { fetchRecentDraws, fetchAllGamesRecent } from "./lib/lotteryusa-scraper";
import { runAllModels, selectBudgetTickets, applySumRangeFilter } from "./predictions";
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
        const cfg = FLORIDA_GAMES[input.gameType];
        const historyRows = await getDrawResults(input.gameType, 200);
        const history = historyRows.map(r => ({
          mainNumbers: r.mainNumbers as number[],
          specialNumbers: (r.specialNumbers as number[]) || [],
          drawDate: r.drawDate,
        }));

        const modelWeights = await getModelWeights(input.gameType);
        const allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);
        const selection = selectBudgetTickets(cfg, allPredictions, input.budget, input.maxTickets);

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
          ...selection,
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

        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are an expert lottery analytics assistant. Provide clear, data-driven analysis. Use markdown formatting for readability. Always include a disclaimer that lottery outcomes are random and no prediction system can guarantee wins." },
              { role: "user", content: prompts[input.analysisType] },
            ],
          });

          const content = result.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

          return { analysis: text, analysisType: input.analysisType, gameType: input.gameType };
        } catch (e) {
          console.error("[Analysis] LLM call failed:", e);
          return {
            analysis: "Analysis is temporarily unavailable. Please try again later.",
            analysisType: input.analysisType,
            gameType: input.gameType,
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
        const { eq } = await import("drizzle-orm");
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

        // For each perf record, get the prediction numbers
        const modelResults = await Promise.all(perfRows.map(async (perf) => {
          let predNumbers: { main: number[]; special: number[] } = { main: [], special: [] };
          if (perf.predictionId) {
            const predRow = await db.select().from(predictions).where(eq(predictions.id, perf.predictionId)).limit(1);
            if (predRow.length > 0) {
              predNumbers = {
                main: predRow[0].mainNumbers as number[],
                special: (predRow[0].specialNumbers as number[]) || [],
              };
            }
          }
          return {
            modelName: perf.modelName,
            mainHits: perf.mainHits,
            specialHits: perf.specialHits,
            predictedMain: predNumbers.main,
            predictedSpecial: predNumbers.special,
          };
        }));

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

  // ─── Data Fetch (auto-fetch lottery results from official FL Lottery files) ──
  dataFetch: router({
    /** Fetch latest results for a single game from lotteryusa.com */
    fetchLatest: adminProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .mutation(async ({ input }) => {
        try {
          const draws = await fetchRecentDraws(input.gameType as GameType);
          let insertedCount = 0;

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
              insertedCount++;

              // Auto-evaluate predictions against this new draw
              const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
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
            } catch (e) {
              // Duplicate draw, skip silently
            }
          }

          return { success: true, data: { draws }, insertedCount };
        } catch (e) {
          console.error("[DataFetch] fetchLatest failed:", e);
          return { success: false, data: null, insertedCount: 0 };
        }
      }),

    /** Fetch latest results for ALL games at once from lotteryusa.com */
    fetchAll: adminProcedure
      .mutation(async () => {
        const results: Record<string, { success: boolean; count: number }> = {};

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
                count++;

                const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
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
              } catch (e) {
                // Duplicate, skip
              }
            }
            results[gt] = { success: true, count };
          }
        } catch (e) {
          console.error("[DataFetch] fetchAll failed:", e);
        }

        return { success: true, results };
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

          for (const draw of draws) {
            try {
              await insertDrawResult({
                gameType: input.gameType,
                drawDate: new Date(draw.drawDate).getTime(),
                mainNumbers: draw.mainNumbers,
                specialNumbers: draw.specialNumbers,
                drawTime: draw.drawTime,
                source: "lotteryusa.com",
              });
              insertedCount++;
            } catch (e) {
              skippedCount++;
            }
          }

          if (insertedCount > 10) {
            await notifyOwner({
              title: "Historical Data Loaded",
              content: `Loaded ${insertedCount} historical draws for ${cfg.name}. ${skippedCount} duplicates skipped. Total found: ${draws.length}. Prediction models now have more data.`,
            });
          }

          return { success: true, insertedCount, skippedCount, totalFound: draws.length };
        } catch (e) {
          console.error("[DataFetch] fetchHistory failed:", e);
          return { success: false, insertedCount: 0, skippedCount: 0, totalFound: 0 };
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
  }),
});

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export type AppRouter = typeof appRouter;
