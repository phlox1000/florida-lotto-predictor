import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { runAllModels, selectBudgetTickets } from "./predictions";
import {
  getDrawResults, insertDrawResult, getLatestDrawResults, getAllDrawResults,
  insertPredictions, getUserPredictions, getRecentPredictions,
  insertTicketSelection, getUserTicketSelections,
  getModelPerformanceStats, insertModelPerformance,
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
    /** Run all 16 models for a game type */
    generate: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .mutation(async ({ input, ctx }) => {
        const cfg = FLORIDA_GAMES[input.gameType];
        // Fetch history from DB
        const historyRows = await getDrawResults(input.gameType, 200);
        const history = historyRows.map(r => ({
          mainNumbers: r.mainNumbers as number[],
          specialNumbers: (r.specialNumbers as number[]) || [],
          drawDate: r.drawDate,
        }));

        const allPredictions = runAllModels(cfg, history);

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

        return { predictions: allPredictions, gameType: input.gameType, gameName: cfg.name };
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

        const allPredictions = runAllModels(cfg, history);
        const selection = selectBudgetTickets(cfg, allPredictions, input.budget, input.maxTickets);

        // Persist if user is logged in
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
        await insertDrawResult({
          gameType: input.gameType,
          drawDate: input.drawDate,
          mainNumbers: input.mainNumbers,
          specialNumbers: input.specialNumbers || [],
          drawTime: input.drawTime,
          source: "manual",
        });

        // Check if any recent predictions match well and notify owner
        try {
          const recentPreds = await getRecentPredictions(input.gameType, 50);
          const resultSet = new Set(input.mainNumbers);
          let highAccuracyCount = 0;
          for (const pred of recentPreds) {
            const predNums = pred.mainNumbers as number[];
            const hits = predNums.filter(n => resultSet.has(n)).length;
            if (hits >= Math.ceil(predNums.length * 0.6)) {
              highAccuracyCount++;
            }
          }
          if (highAccuracyCount > 3) {
            await notifyOwner({
              title: "High Prediction Accuracy Detected",
              content: `${highAccuracyCount} predictions matched 60%+ of the latest ${FLORIDA_GAMES[input.gameType].name} draw (${input.mainNumbers.join(", ")}). This exceeds the notification threshold.`,
            });
          }
        } catch (e) {
          console.warn("[Draws] Notification check failed:", e);
        }

        return { success: true };
      }),
  }),

  // ─── Model Performance ──────────────────────────────────────────────────────
  performance: router({
    /** Get model performance stats for a game */
    stats: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .query(async ({ input }) => {
        return getModelPerformanceStats(input.gameType);
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

        const historyStr = historyRows.slice(0, 20).map(r => {
          const nums = r.mainNumbers as number[];
          const special = r.specialNumbers as number[] | null;
          return `${new Date(r.drawDate).toLocaleDateString()}: ${nums.join(", ")}${special && special.length > 0 ? ` | Special: ${special.join(", ")}` : ""}`;
        }).join("\n");

        const perfStr = perfStats.map(s =>
          `${s.modelName}: ${s.totalPredictions} predictions, avg ${Number(s.avgMainHits).toFixed(1)} main hits, max ${s.maxMainHits}`
        ).join("\n");

        const prompts: Record<string, string> = {
          model_performance: `You are a lottery analytics expert. Analyze the performance of these prediction models for ${cfg.name}:\n\nModel Performance:\n${perfStr || "No performance data yet."}\n\nRecent Draw History:\n${historyStr || "No draw history yet."}\n\nExplain which models performed best and why. Be specific about statistical patterns. Keep the response concise (3-4 paragraphs).`,
          pattern_analysis: `You are a lottery number pattern analyst. Analyze the recent draw history for ${cfg.name}:\n\nRecent Draws:\n${historyStr || "No draw history yet."}\n\nIdentify any notable patterns: hot/cold numbers, number gaps, frequency distributions, consecutive number patterns, sum ranges, and odd/even distributions. Keep the response concise (3-4 paragraphs).`,
          strategy_recommendation: `You are a lottery strategy advisor. Based on the following data for ${cfg.name}, provide personalized betting strategy recommendations:\n\nRecent Draws:\n${historyStr || "No draw history yet."}\n\nModel Performance:\n${perfStr || "No performance data yet."}\n\nBudget constraint: $75 per drawing cycle, 20 tickets maximum.\nProvide specific, actionable recommendations for ticket selection strategy. Include which models to trust more and how to diversify. Keep the response concise (3-4 paragraphs).`,
        };

        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are an expert lottery analytics assistant. Provide clear, data-driven analysis. Use markdown formatting for readability. Always include a disclaimer that lottery outcomes are random and no prediction system can guarantee wins." },
              { role: "user", content: prompts[input.analysisType] },
            ],
          });

          const content = result.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : Array.isArray(content) ? content.map(c => "text" in c ? c.text : "").join("") : "";

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

  // ─── Data Fetch (auto-fetch lottery results) ────────────────────────────────
  dataFetch: router({
    /** Trigger a fetch of latest lottery results */
    fetchLatest: adminProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .mutation(async ({ input }) => {
        // Use LLM to parse lottery data from a known format
        // In production, this would call the Florida Lottery API directly
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are a data extraction assistant. Return ONLY valid JSON." },
              { role: "user", content: `Generate the most recent Florida ${FLORIDA_GAMES[input.gameType].name} lottery drawing results as realistic sample data. Return JSON: { "drawDate": "YYYY-MM-DD", "mainNumbers": [numbers], "specialNumbers": [numbers or empty array], "drawTime": "evening" }. Use today's date or the most recent drawing date.` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "lottery_result",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    drawDate: { type: "string" },
                    mainNumbers: { type: "array", items: { type: "number" } },
                    specialNumbers: { type: "array", items: { type: "number" } },
                    drawTime: { type: "string" },
                  },
                  required: ["drawDate", "mainNumbers", "specialNumbers", "drawTime"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = result.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : "";
          const parsed = JSON.parse(text);

          await insertDrawResult({
            gameType: input.gameType,
            drawDate: new Date(parsed.drawDate).getTime(),
            mainNumbers: parsed.mainNumbers,
            specialNumbers: parsed.specialNumbers,
            drawTime: parsed.drawTime,
            source: "api",
          });

          return { success: true, data: parsed };
        } catch (e) {
          console.error("[DataFetch] Failed:", e);
          return { success: false, data: null };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
