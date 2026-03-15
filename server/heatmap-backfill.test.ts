import { describe, it, expect } from "vitest";

describe("Heatmap endpoint", () => {
  it("should return grid structure with correct fields", () => {
    // Simulate the grid generation logic
    const pool = Array.from({ length: 36 }, (_, i) => i + 1);
    const dates = [
      { date: "Mar 14, 26", numbers: [5, 10, 15, 20, 25], specialNumbers: [] },
      { date: "Mar 13, 26", numbers: [3, 10, 18, 25, 30], specialNumbers: [] },
      { date: "Mar 12, 26", numbers: [1, 10, 22, 25, 36], specialNumbers: [] },
    ];

    const grid = pool.map(num => ({
      number: num,
      hits: dates.map(d => d.numbers.includes(num)),
      totalHits: dates.filter(d => d.numbers.includes(num)).length,
    }));

    expect(grid).toHaveLength(36);
    expect(grid[0].number).toBe(1);
    expect(grid[0].hits).toEqual([false, false, true]); // 1 only in 3rd draw
    expect(grid[0].totalHits).toBe(1);

    // Number 10 appears in all 3 draws
    const num10 = grid.find(g => g.number === 10)!;
    expect(num10.hits).toEqual([true, true, true]);
    expect(num10.totalHits).toBe(3);

    // Number 25 appears in all 3 draws
    const num25 = grid.find(g => g.number === 25)!;
    expect(num25.totalHits).toBe(3);

    // Number 2 never appears
    const num2 = grid.find(g => g.number === 2)!;
    expect(num2.hits).toEqual([false, false, false]);
    expect(num2.totalHits).toBe(0);
  });

  it("should compute hot zones (max consecutive) correctly", () => {
    const hits = [true, true, true, false, true, true, false, true];
    let maxConsecutive = 0, current = 0;
    for (const hit of hits) {
      if (hit) { current++; maxConsecutive = Math.max(maxConsecutive, current); }
      else current = 0;
    }
    expect(maxConsecutive).toBe(3);
  });

  it("should compute hot zones for all-hit case", () => {
    const hits = [true, true, true, true, true];
    let maxConsecutive = 0, current = 0;
    for (const hit of hits) {
      if (hit) { current++; maxConsecutive = Math.max(maxConsecutive, current); }
      else current = 0;
    }
    expect(maxConsecutive).toBe(5);
  });

  it("should compute hot zones for no-hit case", () => {
    const hits = [false, false, false];
    let maxConsecutive = 0, current = 0;
    for (const hit of hits) {
      if (hit) { current++; maxConsecutive = Math.max(maxConsecutive, current); }
      else current = 0;
    }
    expect(maxConsecutive).toBe(0);
  });

  it("should sort hotNumbers by totalHits descending", () => {
    const grid = [
      { number: 1, totalHits: 2, maxConsecutive: 1 },
      { number: 5, totalHits: 5, maxConsecutive: 3 },
      { number: 10, totalHits: 3, maxConsecutive: 2 },
      { number: 15, totalHits: 1, maxConsecutive: 1 },
    ];
    const sorted = [...grid].sort((a, b) => b.totalHits - a.totalHits);
    expect(sorted[0].number).toBe(5);
    expect(sorted[1].number).toBe(10);
    expect(sorted[2].number).toBe(1);
    expect(sorted[3].number).toBe(15);
  });
});

describe("Backfill evaluation logic", () => {
  it("should correctly count main number hits", () => {
    const predMain = [5, 10, 15, 20, 25];
    const drawMain = new Set([5, 12, 15, 28, 33]);
    const mainHits = predMain.filter(n => drawMain.has(n)).length;
    expect(mainHits).toBe(2); // 5 and 15
  });

  it("should correctly count special number hits", () => {
    const predSpecial = [7];
    const drawSpecial = new Set([7]);
    const specialHits = predSpecial.filter(n => drawSpecial.has(n)).length;
    expect(specialHits).toBe(1);
  });

  it("should return 0 hits for no matches", () => {
    const predMain = [1, 2, 3, 4, 5];
    const drawMain = new Set([10, 20, 30, 31, 32]);
    const mainHits = predMain.filter(n => drawMain.has(n)).length;
    expect(mainHits).toBe(0);
  });

  it("should return full hits for perfect match", () => {
    const predMain = [5, 10, 15, 20, 25];
    const drawMain = new Set([5, 10, 15, 20, 25]);
    const mainHits = predMain.filter(n => drawMain.has(n)).length;
    expect(mainHits).toBe(5);
  });

  it("should correctly filter predictions within 14-day window", () => {
    const drawDate = new Date("2026-03-14").getTime();
    const fourteenDaysBefore = drawDate - 14 * 24 * 60 * 60 * 1000;

    const predictions = [
      { createdAt: "2026-03-13T10:00:00Z", id: 1 }, // 1 day before - valid
      { createdAt: "2026-03-01T10:00:00Z", id: 2 }, // 13 days before - valid
      { createdAt: "2026-02-27T10:00:00Z", id: 3 }, // 15 days before - invalid
      { createdAt: "2026-03-15T10:00:00Z", id: 4 }, // after draw - invalid
    ];

    const matching = predictions.filter(p => {
      const predTime = new Date(p.createdAt).getTime();
      return predTime >= fourteenDaysBefore && predTime <= drawDate;
    });

    expect(matching).toHaveLength(2);
    expect(matching[0].id).toBe(1);
    expect(matching[1].id).toBe(2);
  });
});
