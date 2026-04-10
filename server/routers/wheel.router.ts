import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";
import { generateCombinations, generateAbbreviatedWheel, nCr, getSmartNumbers } from "../services/wheel.service";

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
      if (cfg.mainCount <= 1) {
        return { tickets: [], totalCost: 0, coverage: 0, error: "Wheeling is not available for single-number games." };
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
      return getSmartNumbers(input.gameType, input.count);
    }),
});
