import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { getDrawResults, getModelPerformanceStats, getModelWeights } from "../db";
import { gameTypeSchema } from "./routerUtils";

export const analysisRouter = router({
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
});
