import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, router } from "../_core/trpc";
import { runAllModels } from "../predictions";
import { getDrawResults, getModelWeights } from "../db";
import { gameTypeSchema, generateCombinations, generateAbbreviatedWheel, nCr } from "./routerUtils";

export const wheelRouter = router({
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
        combos = generateCombinations(nums, pick);
      } else if (input.wheelType === "abbreviated") {
        combos = generateAbbreviatedWheel(nums, pick);
      } else if (input.wheelType === "key") {
        const key = input.keyNumber ?? nums[0];
        const remaining = nums.filter(n => n !== key);
        const subCombos = generateCombinations(remaining, pick - 1);
        combos = subCombos.map(c => [key, ...c].sort((a, b) => a - b));
      }

      if (combos.length > input.maxTickets) {
        combos = combos.slice(0, input.maxTickets);
      }

      const totalPossible = nCr(nums.length, pick);
      const coverage = totalPossible > 0 ? (combos.length / totalPossible) * 100 : 0;

      const tickets = combos.map((main, i) => ({
        mainNumbers: main,
        specialNumbers: [] as number[],
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

      const historyRows = await getDrawResults(input.gameType, 200);
      const history = historyRows.map(r => ({
        mainNumbers: r.mainNumbers as number[],
        specialNumbers: (r.specialNumbers as number[]) || [],
        drawDate: r.drawDate,
      }));

      if (history.length < 10) {
        return { numbers: [] as number[], modelVotes: {} as Record<number, { count: number; weightedScore: number; models: string[] }>, error: "Need at least 10 historical draws. Use Bulk History in Admin to load data." };
      }

      const modelWeights = await getModelWeights(input.gameType);
      const allResults = runAllModels(cfg, history, modelWeights);

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

      const ranked = [...votes.entries()]
        .sort((a, b) => b[1].weightedScore - a[1].weightedScore);

      const topNumbers = ranked.slice(0, input.count).map(e => e[0]).sort((a, b) => a - b);

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
});
