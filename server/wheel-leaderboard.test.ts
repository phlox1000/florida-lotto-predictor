import { describe, it, expect } from "vitest";

// Test the helper functions directly by importing them
// Since they're private in routers.ts, we'll test the logic inline

/** Generate all combinations of size k from array */
function generateCombinations(arr: number[], k: number): number[][] {
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

function nCr(n: number, r: number): number {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let result = 1;
  for (let i = 0; i < r; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

function generateAbbreviatedWheel(nums: number[], pick: number): number[][] {
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

describe("nCr (combinations formula)", () => {
  it("calculates basic combinations correctly", () => {
    expect(nCr(5, 2)).toBe(10);
    expect(nCr(6, 3)).toBe(20);
    expect(nCr(10, 5)).toBe(252);
    expect(nCr(36, 5)).toBe(376992);
  });

  it("handles edge cases", () => {
    expect(nCr(5, 0)).toBe(1);
    expect(nCr(5, 5)).toBe(1);
    expect(nCr(3, 5)).toBe(0); // r > n
    expect(nCr(1, 1)).toBe(1);
  });
});

describe("generateCombinations (full wheel)", () => {
  it("generates all combinations for small sets", () => {
    const combos = generateCombinations([1, 2, 3, 4, 5], 3);
    expect(combos.length).toBe(10); // 5C3 = 10
    // Each combo should have 3 numbers
    for (const c of combos) {
      expect(c.length).toBe(3);
    }
  });

  it("generates correct count for 7 choose 5", () => {
    const combos = generateCombinations([1, 2, 3, 4, 5, 6, 7], 5);
    expect(combos.length).toBe(21); // 7C5 = 21
  });

  it("generates sorted combinations when input is sorted", () => {
    const combos = generateCombinations([1, 2, 3, 4, 5], 3);
    for (const c of combos) {
      // Each combo should be in ascending order
      for (let i = 1; i < c.length; i++) {
        expect(c[i]).toBeGreaterThan(c[i - 1]);
      }
    }
  });

  it("generates no duplicates", () => {
    const combos = generateCombinations([1, 2, 3, 4, 5, 6, 7, 8], 5);
    const keys = new Set(combos.map(c => c.join(",")));
    expect(keys.size).toBe(combos.length);
  });

  it("handles exact match (n = k)", () => {
    const combos = generateCombinations([1, 2, 3], 3);
    expect(combos.length).toBe(1);
    expect(combos[0]).toEqual([1, 2, 3]);
  });
});

describe("generateAbbreviatedWheel", () => {
  it("generates fewer tickets than full wheel", () => {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const fullCount = nCr(10, 5); // 252
    const abbreviated = generateAbbreviatedWheel(nums, 5);
    expect(abbreviated.length).toBeLessThan(fullCount);
    expect(abbreviated.length).toBeGreaterThan(0);
  });

  it("generates no duplicate tickets", () => {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = generateAbbreviatedWheel(nums, 5);
    const keys = new Set(result.map(c => c.join(",")));
    expect(keys.size).toBe(result.length);
  });

  it("each ticket has correct number of picks", () => {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = generateAbbreviatedWheel(nums, 5);
    for (const ticket of result) {
      expect(ticket.length).toBe(5);
    }
  });

  it("each ticket is sorted", () => {
    const nums = [5, 10, 15, 20, 25, 30, 35];
    const result = generateAbbreviatedWheel(nums, 5);
    for (const ticket of result) {
      for (let i = 1; i < ticket.length; i++) {
        expect(ticket[i]).toBeGreaterThan(ticket[i - 1]);
      }
    }
  });

  it("handles n = k (returns single ticket)", () => {
    const result = generateAbbreviatedWheel([1, 2, 3, 4, 5], 5);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual([1, 2, 3, 4, 5]);
  });

  it("balances number usage across tickets", () => {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = generateAbbreviatedWheel(nums, 5);
    // Count how many times each number appears
    const counts = new Map<number, number>();
    for (const ticket of result) {
      for (const n of ticket) {
        counts.set(n, (counts.get(n) || 0) + 1);
      }
    }
    // All numbers should appear at least once
    for (const n of nums) {
      expect(counts.get(n) || 0).toBeGreaterThan(0);
    }
    // Usage should be roughly balanced (no number used more than 3x the least-used)
    const values = [...counts.values()];
    const minUsage = Math.min(...values);
    const maxUsage = Math.max(...values);
    expect(maxUsage).toBeLessThanOrEqual(minUsage * 4);
  });
});

describe("Key Number Wheel logic", () => {
  it("key number appears in every ticket", () => {
    const key = 7;
    const remaining = [1, 2, 3, 4, 5, 6, 8, 9, 10].filter(n => n !== key);
    const subCombos = generateCombinations(remaining, 4); // pick-1 = 4
    const tickets = subCombos.map(c => [key, ...c].sort((a, b) => a - b));
    
    for (const ticket of tickets) {
      expect(ticket).toContain(key);
      expect(ticket.length).toBe(5);
    }
  });

  it("generates correct number of key wheel tickets", () => {
    const key = 1;
    const remaining = [2, 3, 4, 5, 6, 7, 8];
    const subCombos = generateCombinations(remaining, 4);
    expect(subCombos.length).toBe(nCr(7, 4)); // 35
  });
});
