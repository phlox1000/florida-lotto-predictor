import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { getDrawResults, getModelPerformanceStats, getModelWeights } from "../db";
import { analyzePatterns } from "./patterns.service";

type AnalysisType = "model_performance" | "pattern_analysis" | "strategy_recommendation";

interface AnalysisResult {
  analysis: string;
  analysisType: AnalysisType;
  gameType: GameType;
  observability: { providerAttempted: boolean; fallbackUsed: boolean };
}

const DISCLAIMER =
  "\n\n*Lottery outcomes are random. This summary is derived from stored draw history and model metrics in the app. It is informational only and not a guarantee of future results.*";

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

type DrawRow = {
  id: number;
  mainNumbers: unknown;
  specialNumbers: unknown;
  drawDate: number;
  drawTime: string | null;
};

function buildLocalAnalysis(
  analysisType: AnalysisType,
  gameName: string,
  cfg: (typeof FLORIDA_GAMES)[GameType],
  historyRows: Awaited<ReturnType<typeof getDrawResults>>,
  perfStats: Awaited<ReturnType<typeof getModelPerformanceStats>>,
  modelWeights: Record<string, number>,
): string {
  const intro =
    `**On-device data summary (${gameName})** — AI narrative is offline; below is a concise readout from the draws and evaluation data stored in this app.${DISCLAIMER}\n\n`;

  if (historyRows.length === 0 && perfStats.length === 0) {
    return (
      intro +
      "There is not enough history in the database for this game yet. After more draws are recorded and predictions are scored, this section will summarize frequency, model leaderboards, and weighting. You can still use the Predictions and Patterns tabs with whatever data is available."
    );
  }

  if (analysisType === "model_performance") {
    const weightEntries = Object.entries(modelWeights);
    if (perfStats.length === 0) {
      const wPart =
        weightEntries.length > 0
          ? `Tracked weights (from prior evaluations): ${weightEntries
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([m, w]) => `**${m}** at ${(w * 100).toFixed(0)}%`)
              .join(", ")}.`
          : "Model accuracy weights are not available yet (needs scored predictions after draws).";
      return (
        intro +
        `**Model performance:** No per-model hit statistics are stored yet for ${gameName}. ${wPart} As evaluation runs complete, average main-number hits and max hits will appear here.`
      );
    }

    const sorted = [...perfStats].sort(
      (a, b) => Number(b.avgMainHits) - Number(a.avgMainHits),
    );
    const top = sorted.slice(0, 5);
    const lines = top.map(
      (s, i) =>
        `${i + 1}. **${s.modelName}** — ${s.totalPredictions} scored predictions, **${Number(s.avgMainHits).toFixed(2)}** avg main hits (max **${s.maxMainHits}**).`,
    );
    const wLines =
      weightEntries.length > 0
        ? `**Weight emphasis (auto-calibrated):** ${weightEntries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([m, w]) => `${m} ${(w * 100).toFixed(0)}%`)
            .join(", ")}.`
        : "Weights are still defaulting until enough evaluations exist.";

    return (
      intro +
      `**Leaderboard (by average main hits):**\n\n${lines.join("\n")}\n\n${wLines}\n\nHigher average hits in this table suggest stronger historical alignment with results for this game; use it as one input alongside the pattern charts.`
    );
  }

  if (analysisType === "pattern_analysis") {
    if (cfg.isDigitGame) {
      const recent = historyRows.slice(0, 30);
      if (recent.length === 0) {
        return (
          intro +
          "**Digit game:** There are no draw results in the database for this game in the current window. After draws are imported, this summary will rank digit frequency from recent games."
        );
      }
      const digitCounts = new Map<number, number>();
      for (const row of recent) {
        for (const d of row.mainNumbers as number[]) {
          digitCounts.set(d, (digitCounts.get(d) || 0) + 1);
        }
      }
      const sortedDigits = [...digitCounts.entries()].sort((a, b) => b[1] - a[1]);
      const top = sortedDigits.slice(0, 5);
      const cold = sortedDigits.slice(-3).reverse();
      return (
        intro +
        `**Digit frequency** across the last **${recent.length}** stored drawings: most common digits **${top.map(([d]) => d).join(", ")}**; least frequent among those observed **${cold.map(([d]) => d).join(", ")}**. Digits are tracked position-independently here; see the Patterns tab for charts.`
      );
    }

    if (historyRows.length === 0) {
      return (
        intro +
        "There is no draw history in the database for this game in the current window. Import or fetch results to enable frequency, pair, and overdue calculations in this summary and on the Patterns tab."
      );
    }
    const draws: DrawRow[] = historyRows.map(r => ({
      id: r.id,
      mainNumbers: r.mainNumbers,
      specialNumbers: r.specialNumbers,
      drawDate: r.drawDate,
      drawTime: r.drawTime,
    }));
    const patterns = analyzePatterns(draws, {
      mainMax: cfg.mainMax,
      specialMax: cfg.specialMax,
      specialCount: cfg.specialCount,
    });

    const hot = patterns.frequency.slice(0, 5).map(f => f.number);
    const cold = patterns.frequency.slice(-5).map(f => f.number);
    const overdueTop = patterns.overdue.slice(0, 3).map(o => o.number);

    const recentMain = historyRows.slice(0, 15).map(r => r.mainNumbers as number[]);
    const sums: number[] = recentMain.map(nums => nums.reduce((a, b) => a + b, 0));
    const minSum = Math.min(...sums);
    const maxSum = Math.max(...sums);
    const avgSum = sums.reduce((a, b) => a + b, 0) / Math.max(1, sums.length);

    let oddEvenLine = "";
    if (recentMain.length > 0) {
      const oddCounts = recentMain.map(nums => nums.filter(n => n % 2 === 1).length);
      const avgOdd = oddCounts.reduce((a, b) => a + b, 0) / oddCounts.length;
      oddEvenLine = `Across the last **${recentMain.length}** draws, main lines averaged about **${avgOdd.toFixed(1)}** odd numbers (out of **${cfg.mainCount}**). `;
    }

    const topPair = patterns.pairs[0];
    const pairLine = topPair
      ? `Most co-occurring pair in the window: **${topPair.numberA}** & **${topPair.numberB}** (${topPair.count} times, ${topPair.percentage.toFixed(1)}% of draws).`
      : "Pair statistics need a bit more draw history to stabilize.";

    return (
      intro +
      `**Frequency:** hottest main numbers in the stored window: **${hot.join(", ")}**; lowest observed frequency: **${cold.join(", ")}**.\n\n` +
      `**Gaps / overdue:** numbers with the longest current absence (informational only): **${overdueTop.join(", ")}**.\n\n` +
      `**Sums (last ${Math.min(15, historyRows.length)} draws):** min **${minSum}**, max **${maxSum}**, average **${avgSum.toFixed(0)}**.\n\n` +
      oddEvenLine +
      pairLine
    );
  }

  // strategy_recommendation
  const sorted = [...perfStats].sort(
    (a, b) => Number(b.avgMainHits) - Number(a.avgMainHits),
  );
  const best = sorted[0];
  const weightTop = Object.entries(modelWeights).sort((a, b) => b[1] - a[1])[0];
  const perfLine = best
    ? `**Accuracy snapshot:** **${best.modelName}** currently leads on average main hits (**${Number(best.avgMainHits).toFixed(2)}**) over **${best.totalPredictions}** scored predictions.`
    : "There is not enough scored model history to rank models yet.";
  const wLine = weightTop
    ? `**System weighting** is emphasizing **${weightTop[0]}** (~**${(weightTop[1] * 100).toFixed(0)}%** of the blend when present).`
    : "Model weights are still baselining — diversify across several models in the app rather than a single name.";

  return (
    intro +
    `**Practical use of this data (not financial advice):** "Strategy" for a lottery is always constrained by randomness. Use a fixed entertainment budget, avoid chasing losses, and treat suggestions as a way to diversify picks rather than a system that beats the odds.\n\n` +
    `${perfLine}\n\n` +
    `${wLine}\n\n` +
    `For a **~$75 / 20-ticket** style cap mentioned in the product, spread selections across high-weight models and a few long-shot models so your ticket set reflects both measured accuracy and variety — consistent with the ensemble design in the Predictions tab.`
  );
}

export async function generateAnalysis(
  gameType: GameType,
  analysisType: AnalysisType,
): Promise<AnalysisResult> {
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
    console.warn("[Analysis] No LLM API key — returning local data summary");
    fallbackUsed = true;
    return {
      analysis: buildLocalAnalysis(analysisType, cfg.name, cfg, historyRows, perfStats, modelWeights),
      analysisType,
      gameType,
      observability: { providerAttempted, fallbackUsed },
    };
  }

  try {
    providerAttempted = true;
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert lottery analytics assistant. Provide clear, data-driven analysis. Use markdown formatting for readability. Always include a disclaimer that lottery outcomes are random and no prediction system can guarantee wins.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text =
      typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => ("text" in c ? c.text : "")).join("") : "";
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      console.warn("[Analysis] LLM returned empty content — using local data summary");
      fallbackUsed = true;
      return {
        analysis: buildLocalAnalysis(analysisType, cfg.name, cfg, historyRows, perfStats, modelWeights),
        analysisType,
        gameType,
        observability: { providerAttempted, fallbackUsed },
      };
    }

    return {
      analysis: trimmed,
      analysisType,
      gameType,
      observability: { providerAttempted, fallbackUsed },
    };
  } catch (e) {
    console.error("[Analysis] LLM call failed:", e);
    fallbackUsed = true;
    return {
      analysis: buildLocalAnalysis(analysisType, cfg.name, cfg, historyRows, perfStats, modelWeights),
      analysisType,
      gameType,
      observability: { providerAttempted, fallbackUsed },
    };
  }
}
