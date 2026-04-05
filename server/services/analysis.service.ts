import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { getDrawResults, getModelPerformanceStats, getModelWeights } from "../db";

type AnalysisType = "model_performance" | "pattern_analysis" | "strategy_recommendation";

interface AnalysisResult {
  analysis: string;
  analysisType: AnalysisType;
  gameType: GameType;
  observability: { providerAttempted: boolean; fallbackUsed: boolean };
}

function buildContextStrings(
  historyRows: Awaited<ReturnType<typeof getDrawResults>>,
  perfStats: Awaited<ReturnType<typeof getModelPerformanceStats>>,
  modelWeights: Record<string, number>,
) {
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

  return { historyStr, perfStr, weightsStr };
}

function buildPrompt(
  analysisType: AnalysisType,
  gameName: string,
  historyStr: string,
  perfStr: string,
  weightsStr: string,
): string {
  const prompts: Record<AnalysisType, string> = {
    model_performance: `You are a lottery analytics expert. Analyze the performance of these prediction models for ${gameName}:\n\nModel Performance:\n${perfStr || "No performance data yet."}\n\nCurrent Model Weights (from accuracy tracking):\n${weightsStr || "No weights calculated yet — need more data."}\n\nRecent Draw History:\n${historyStr || "No draw history yet."}\n\nExplain which models performed best and why. Discuss how the auto-weighting system is adjusting. Be specific about statistical patterns. Keep the response concise (3-4 paragraphs).`,
    pattern_analysis: `You are a lottery number pattern analyst. Analyze the recent draw history for ${gameName}:\n\nRecent Draws:\n${historyStr || "No draw history yet."}\n\nIdentify any notable patterns: hot/cold numbers, number gaps, frequency distributions, consecutive number patterns, sum ranges, and odd/even distributions. Keep the response concise (3-4 paragraphs).`,
    strategy_recommendation: `You are a lottery strategy advisor. Based on the following data for ${gameName}, provide personalized betting strategy recommendations:\n\nRecent Draws:\n${historyStr || "No draw history yet."}\n\nModel Performance:\n${perfStr || "No performance data yet."}\n\nModel Weights:\n${weightsStr || "No weights yet."}\n\nBudget constraint: $75 per drawing cycle, 20 tickets maximum.\nProvide specific, actionable recommendations for ticket selection strategy. Include which models to trust more based on their accuracy weights and how to diversify. Keep the response concise (3-4 paragraphs).`,
  };
  return prompts[analysisType];
}

export async function generateAnalysis(gameType: GameType, analysisType: AnalysisType): Promise<AnalysisResult> {
  const cfg = FLORIDA_GAMES[gameType];
  const [historyRows, perfStats, modelWeights] = await Promise.all([
    getDrawResults(gameType, 50),
    getModelPerformanceStats(gameType),
    getModelWeights(gameType),
  ]);

  const { historyStr, perfStr, weightsStr } = buildContextStrings(historyRows, perfStats, modelWeights);
  const prompt = buildPrompt(analysisType, cfg.name, historyStr, perfStr, weightsStr);

  const hasApiKey = Boolean(ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0);
  let providerAttempted = false;
  let fallbackUsed = false;

  if (!hasApiKey) {
    console.warn("[Analysis] No LLM API key configured — returning fallback text");
    fallbackUsed = true;
    return {
      analysis: "Analysis is temporarily unavailable. Please configure the LLM API key (BUILT_IN_FORGE_API_KEY) to enable AI-powered analysis.",
      analysisType,
      gameType,
      observability: { providerAttempted, fallbackUsed },
    };
  }

  try {
    providerAttempted = true;
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert lottery analytics assistant. Provide clear, data-driven analysis. Use markdown formatting for readability. Always include a disclaimer that lottery outcomes are random and no prediction system can guarantee wins." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => "text" in c ? c.text : "").join("") : "";

    return {
      analysis: text,
      analysisType,
      gameType,
      observability: { providerAttempted, fallbackUsed },
    };
  } catch (e) {
    console.error("[Analysis] LLM call failed:", e);
    fallbackUsed = true;
    return {
      analysis: "Analysis is temporarily unavailable. Please try again later.",
      analysisType,
      gameType,
      observability: { providerAttempted, fallbackUsed },
    };
  }
}
