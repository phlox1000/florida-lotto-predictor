import { z } from "zod";
import { GAME_TYPES } from "@shared/lottery";

export const gameTypeSchema = z.enum(GAME_TYPES);

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
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
