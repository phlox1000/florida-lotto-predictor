import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { FLORIDA_GAMES, GAME_TYPES, type GameType, getNextDrawDate, formatTimeUntil } from "@shared/lottery";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { runAllModels, selectBudgetTickets } from "./predictions";
import {
  getDrawResults, insertDrawResult, getLatestDrawResults, getAllDrawResults, getDrawResultCount,
  insertPredictions, getUserPredictions, getRecentPredictions,
  insertTicketSelection, getUserTicketSelections,
  getModelPerformanceStats, getModelWeights, evaluatePredictionsAgainstDraw,
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
    /** Run all 16 models for a game type, using accuracy-based weights when available */
    generate: publicProcedure
      .input(z.object({ gameType: gameTypeSchema }))
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
        const allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);

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

  // ─── Data Fetch (auto-fetch lottery results) ────────────────────────────────
  dataFetch: router({
    /** Trigger a fetch of latest lottery results by scraping floridalottery.com */
    fetchLatest: adminProcedure
      .input(z.object({ gameType: gameTypeSchema }))
      .mutation(async ({ input }) => {
        try {
          const axios = (await import("axios")).default;
          const resp = await axios.get("https://floridalottery.com/games/winning-numbers", {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoOracle/1.0)" },
            timeout: 15000,
          });
          const html: string = resp.data;
          const drawSection = html.includes("Draw Results")
            ? html.substring(html.indexOf("Draw Results"), html.indexOf("Draw Results") + 8000)
            : html.substring(0, 10000);

          const gameNameMap: Record<string, string> = {
            powerball: "POWERBALL", mega_millions: "MEGA MILLIONS", florida_lotto: "FLORIDA LOTTO",
            cash4life: "CASH4LIFE", fantasy_5: "FANTASY 5", pick_5: "PICK 5",
            pick_4: "PICK 4", pick_3: "PICK 3", pick_2: "PICK 2",
          };
          const targetGame = gameNameMap[input.gameType] || FLORIDA_GAMES[input.gameType].name;
          const cfg = FLORIDA_GAMES[input.gameType];

          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are a precise data extraction assistant. Extract lottery results from HTML. Return ONLY valid JSON. Today's date is " + new Date().toISOString().split("T")[0] + "." },
              { role: "user", content: `Extract the MOST RECENT ${targetGame} drawing results from this Florida Lottery HTML page content. The game has ${cfg.mainCount} main numbers (1-${cfg.mainMax})${cfg.specialCount > 0 ? ` and ${cfg.specialCount} special number(s) (1-${cfg.specialMax})` : ""}. If there are midday and evening draws, return both. Return JSON with: { "draws": [{ "drawDate": "YYYY-MM-DD", "mainNumbers": [numbers], "specialNumbers": [numbers or empty array], "drawTime": "evening" or "midday" }] }. Include up to 5 most recent draws if available.\n\nHTML content:\n${drawSection}` },
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
              const insertResult = await insertDrawResult({
                gameType: input.gameType,
                drawDate: new Date(draw.drawDate).getTime(),
                mainNumbers: draw.mainNumbers,
                specialNumbers: draw.specialNumbers,
                drawTime: draw.drawTime,
                source: "floridalottery.com",
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
                const insertResult = await insertDrawResult({
                  gameType: gt,
                  drawDate: new Date(draw.drawDate).getTime(),
                  mainNumbers: draw.mainNumbers,
                  specialNumbers: draw.specialNumbers,
                  drawTime: draw.drawTime,
                  source: "floridalottery.com",
                });
                count++;

                // Auto-evaluate
                const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
                if (drawId) {
                  const evalResult = await evaluatePredictionsAgainstDraw(
                    drawId, gt, draw.mainNumbers, draw.specialNumbers
                  );
                  if (evalResult.highAccuracy > 3) {
                    await notifyOwner({
                      title: "High Prediction Accuracy Detected",
                      content: `${evalResult.highAccuracy} predictions matched 60%+ of ${FLORIDA_GAMES[gt].name} draw on ${draw.drawDate}.`,
                    });
                  }
                }
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

    /** Fetch bulk historical data for a game (scrapes multiple pages) */
    fetchHistory: adminProcedure
      .input(z.object({
        gameType: gameTypeSchema,
        drawCount: z.number().min(10).max(100).default(50),
      }))
      .mutation(async ({ input }) => {
        try {
          const axios = (await import("axios")).default;
          const cfg = FLORIDA_GAMES[input.gameType];
          const gameUrlMap: Record<string, string> = {
            powerball: "powerball", mega_millions: "mega-millions", florida_lotto: "florida-lotto",
            cash4life: "cash4life", fantasy_5: "fantasy-5", pick_5: "pick-5",
            pick_4: "pick-4", pick_3: "pick-3", pick_2: "pick-2",
          };
          const slug = gameUrlMap[input.gameType] || input.gameType;

          // Fetch the game-specific past results page
          const resp = await axios.get(`https://floridalottery.com/games/${slug}`, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoOracle/1.0)" },
            timeout: 20000,
          });
          const html: string = resp.data;

          // Get a larger section for historical data
          const relevantHtml = html.substring(0, 20000);

          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are a precise data extraction assistant. Extract ALL lottery drawing results you can find from the HTML. Return ONLY valid JSON. Today is " + new Date().toISOString().split("T")[0] + "." },
              { role: "user", content: `Extract ALL ${cfg.name} drawing results from this Florida Lottery page. The game has ${cfg.mainCount} main numbers${cfg.isDigitGame ? " (digits 0-9)" : ` (1-${cfg.mainMax})`}${cfg.specialCount > 0 ? ` and ${cfg.specialCount} special number(s) (1-${cfg.specialMax})` : ""}. Extract as many draws as you can find (up to ${input.drawCount}). Return JSON: { "draws": [{ "drawDate": "YYYY-MM-DD", "mainNumbers": [numbers], "specialNumbers": [numbers or empty], "drawTime": "evening" }] }. Sort by date descending (newest first).\n\nHTML:\n${relevantHtml}` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "historical_draws",
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
          let skippedCount = 0;

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
              skippedCount++;
            }
          }

          // Notify if we got a significant amount of data
          if (insertedCount > 10) {
            await notifyOwner({
              title: "Historical Data Loaded",
              content: `Loaded ${insertedCount} historical draws for ${cfg.name}. ${skippedCount} duplicates skipped. Prediction models now have more data to work with.`,
            });
          }

          return { success: true, insertedCount, skippedCount, totalFound: parsed.draws.length };
        } catch (e) {
          console.error("[DataFetch] fetchHistory failed:", e);
          return { success: false, insertedCount: 0, skippedCount: 0, totalFound: 0 };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
