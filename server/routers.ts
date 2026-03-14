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
    /** Trigger a fetch of latest lottery results by scraping floridalottery.com */
    fetchLatest: adminProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .mutation(async ({ input }) => {
        try {
          // Fetch the winning numbers page from floridalottery.com
          const axios = (await import("axios")).default;
          const resp = await axios.get("https://floridalottery.com/games/winning-numbers", {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoOracle/1.0)" },
            timeout: 15000,
          });
          const html: string = resp.data;

          // Use LLM to extract structured data from the HTML
          // Trim the HTML to the relevant section to save tokens
          const drawSection = html.includes("Draw Results")
            ? html.substring(html.indexOf("Draw Results"), html.indexOf("Draw Results") + 8000)
            : html.substring(0, 10000);

          const gameNameMap: Record<string, string> = {
            powerball: "POWERBALL",
            mega_millions: "MEGA MILLIONS",
            florida_lotto: "FLORIDA LOTTO",
            cash4life: "CASH4LIFE",
            fantasy_5: "FANTASY 5",
            pick_5: "PICK 5",
            pick_4: "PICK 4",
            pick_3: "PICK 3",
            pick_2: "PICK 2",
          };
          const targetGame = gameNameMap[input.gameType] || FLORIDA_GAMES[input.gameType].name;
          const cfg = FLORIDA_GAMES[input.gameType];

          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are a precise data extraction assistant. Extract lottery results from HTML. Return ONLY valid JSON. Today's date is " + new Date().toISOString().split("T")[0] + "." },
              { role: "user", content: `Extract the MOST RECENT ${targetGame} drawing results from this Florida Lottery HTML page content. The game has ${cfg.mainCount} main numbers (1-${cfg.mainMax})${cfg.specialCount > 0 ? ` and ${cfg.specialCount} special number(s) (1-${cfg.specialMax})` : ""}. If there are midday and evening draws, return the evening draw. Return JSON with: { "draws": [{ "drawDate": "YYYY-MM-DD", "mainNumbers": [numbers], "specialNumbers": [numbers or empty array], "drawTime": "evening" or "midday" }] }. Include up to 5 most recent draws if available.\n\nHTML content:\n${drawSection}` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "lottery_draws",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    draws: {
                      type: "array",
                      items: {
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
                  required: ["draws"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = result.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : "";
          const parsed = JSON.parse(text);
          let insertedCount = 0;

          for (const draw of parsed.draws) {
            try {
              await insertDrawResult({
                gameType: input.gameType,
                drawDate: new Date(draw.drawDate).getTime(),
                mainNumbers: draw.mainNumbers,
                specialNumbers: draw.specialNumbers,
                drawTime: draw.drawTime,
                source: "floridalottery.com",
              });
              insertedCount++;
            } catch (e) {
              // Likely duplicate, skip
              console.warn("[DataFetch] Skipping draw (may be duplicate):", draw.drawDate, e);
            }
          }

          return { success: true, data: parsed, insertedCount };
        } catch (e) {
          console.error("[DataFetch] Failed:", e);
          return { success: false, data: null, insertedCount: 0 };
        }
      }),

    /** Fetch all games at once */
    fetchAll: adminProcedure
      .mutation(async () => {
        const axios = (await import("axios")).default;
        const results: Record<string, { success: boolean; count: number }> = {};

        try {
          const resp = await axios.get("https://floridalottery.com/games/winning-numbers", {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoOracle/1.0)" },
            timeout: 15000,
          });
          const html: string = resp.data;
          const drawSection = html.includes("Draw Results")
            ? html.substring(html.indexOf("Draw Results"), html.indexOf("Draw Results") + 12000)
            : html.substring(0, 15000);

          const extractResult = await invokeLLM({
            messages: [
              { role: "system", content: "You are a precise data extraction assistant. Extract ALL lottery game results from the HTML. Return ONLY valid JSON. Today is " + new Date().toISOString().split("T")[0] + "." },
              { role: "user", content: `Extract the latest drawing results for ALL Florida Lottery games from this HTML. For each game, extract the most recent draw. Games to look for: POWERBALL (5 main 1-69 + 1 powerball 1-26), MEGA MILLIONS (5 main 1-70 + 1 mega ball 1-25), FLORIDA LOTTO (6 main 1-53), FANTASY 5 (5 main 1-36), PICK 5 (5 digits 0-9), PICK 4 (4 digits 0-9), PICK 3 (3 digits 0-9), PICK 2 (2 digits 0-9), CASH4LIFE (5 main 1-60 + 1 cash ball 1-4). For games with midday/evening draws, include both. Return JSON: { "games": [{ "gameType": "powerball|mega_millions|florida_lotto|fantasy_5|cash4life|pick_2|pick_3|pick_4|pick_5", "draws": [{ "drawDate": "YYYY-MM-DD", "mainNumbers": [numbers], "specialNumbers": [numbers or empty], "drawTime": "evening|midday" }] }] }\n\nHTML:\n${drawSection}` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "all_lottery_draws",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    games: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          gameType: { type: "string" },
                          draws: {
                            type: "array",
                            items: {
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
                        required: ["gameType", "draws"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["games"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = extractResult.choices[0]?.message?.content;
          const text = typeof content === "string" ? content : "";
          const parsed = JSON.parse(text);

          for (const game of parsed.games) {
            const gt = game.gameType as GameType;
            if (!FLORIDA_GAMES[gt]) continue;
            let count = 0;
            for (const draw of game.draws) {
              try {
                await insertDrawResult({
                  gameType: gt,
                  drawDate: new Date(draw.drawDate).getTime(),
                  mainNumbers: draw.mainNumbers,
                  specialNumbers: draw.specialNumbers,
                  drawTime: draw.drawTime,
                  source: "floridalottery.com",
                });
                count++;
              } catch (e) {
                console.warn(`[DataFetch] Skipping ${gt} draw:`, draw.drawDate);
              }
            }
            results[gt] = { success: true, count };
          }
        } catch (e) {
          console.error("[DataFetch] fetchAll failed:", e);
        }

        return { success: true, results };
      }),
  }),
});

export type AppRouter = typeof appRouter;
