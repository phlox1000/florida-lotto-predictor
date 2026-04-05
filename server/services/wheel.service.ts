import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { runAllModels } from "../predictions";
import { getDrawResults, getModelWeights } from "../db";

/** Calculate n choose r (combinations) */
export function nCr(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

/** Generate all combinations of size k from array */
export function generateCombinations(arr: number[], k: number): number[][] {
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
export function generateAbbreviatedWheel(nums: number[], pick: number): number[][] {
  const n = nums.length;
  if (n <= pick) return [nums.slice(0, pick)];

  const result: number[][] = [];
  const usageCount = new Map<number, number>();
  for (const num of nums) usageCount.set(num, 0);

  const maxTickets = Math.min(nCr(n, pick), n * 3);
  const seen = new Set<string>();

  for (let t = 0; t < maxTickets; t++) {
    const sorted = [...nums].sort((a, b) => {
      const diff = (usageCount.get(a) || 0) - (usageCount.get(b) || 0);
      return diff !== 0 ? diff : a - b;
    });

    const ticket = sorted.slice(0, pick).sort((a, b) => a - b);
    const key = ticket.join(",");

    if (seen.has(key)) {
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

/** Aggregate consensus numbers from all models for auto-populating a wheel. */
export async function getSmartNumbers(gameType: GameType, count: number) {
  const cfg = FLORIDA_GAMES[gameType];
  if (cfg.isDigitGame) {
    return {
      numbers: [] as number[],
      modelVotes: {} as Record<number, { count: number; weightedScore: number; models: string[] }>,
      error: "Smart Wheel is not available for digit games.",
    };
  }

  const historyRows = await getDrawResults(gameType, 200);
  const history = historyRows.map(r => ({
    mainNumbers: r.mainNumbers as number[],
    specialNumbers: (r.specialNumbers as number[]) || [],
    drawDate: r.drawDate,
  }));

  if (history.length < 10) {
    return {
      numbers: [] as number[],
      modelVotes: {} as Record<number, { count: number; weightedScore: number; models: string[] }>,
      error: "Need at least 10 historical draws. Use Bulk History in Admin to load data.",
    };
  }

  const modelWeights = await getModelWeights(gameType);
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

  const topNumbers = ranked.slice(0, count).map(e => e[0]).sort((a, b) => a - b);

  const modelVotes: Record<number, { count: number; weightedScore: number; models: string[] }> = {};
  for (const [num, data] of ranked.slice(0, count)) {
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
}
