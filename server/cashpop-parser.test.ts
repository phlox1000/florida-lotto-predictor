import { describe, expect, it } from "vitest";
import { parseCashPopText } from "./lib/cashpop-pdf-parser";

const SAMPLE_TEXT = `Please note every effort has been made to ensure that the enclosed information is accurate.
Winning Numbers History
CASH POP
FLORIDA LOTTERY Last Queried:
4/05/2026 as
of 2:01:40 AM
GMT-04:00
Draw Date Morning Matinee Afternoon Evening Late Night
4/4/2026 10 3 11 5 8
4/3/2026 4 6 8 13 1
4/2/2026 15 9 6 10 4
1/49\tPages
Draw Date Morning Matinee Afternoon Evening Late Night
4/1/2026 12 5 14 13 7
3/31/2026 14 15 11 15 2
2/49\tPages`;

describe("parseCashPopText", () => {
  it("parses sample text into correct draws", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    // 5 dates × 5 draw times = 25 draws
    expect(draws.length).toBe(25);
  });

  it("produces one-element mainNumbers arrays", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    for (const d of draws) {
      expect(d.mainNumbers).toHaveLength(1);
      expect(d.specialNumbers).toHaveLength(0);
    }
  });

  it("all numbers are in range 1-15", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    for (const d of draws) {
      expect(d.mainNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(d.mainNumbers[0]).toBeLessThanOrEqual(15);
    }
  });

  it("correctly maps draw times", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    const firstDate = draws.filter(d => d.drawDate === "2026-04-04");
    expect(firstDate).toHaveLength(5);
    expect(firstDate.map(d => d.drawTime)).toEqual([
      "morning", "matinee", "afternoon", "evening", "late_night",
    ]);
  });

  it("correctly parses the winning numbers for a row", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    const apr4 = draws.filter(d => d.drawDate === "2026-04-04");
    expect(apr4[0]).toEqual({ drawDate: "2026-04-04", mainNumbers: [10], specialNumbers: [], drawTime: "morning" });
    expect(apr4[1]).toEqual({ drawDate: "2026-04-04", mainNumbers: [3],  specialNumbers: [], drawTime: "matinee" });
    expect(apr4[2]).toEqual({ drawDate: "2026-04-04", mainNumbers: [11], specialNumbers: [], drawTime: "afternoon" });
    expect(apr4[3]).toEqual({ drawDate: "2026-04-04", mainNumbers: [5],  specialNumbers: [], drawTime: "evening" });
    expect(apr4[4]).toEqual({ drawDate: "2026-04-04", mainNumbers: [8],  specialNumbers: [], drawTime: "late_night" });
  });

  it("parses dates in M/D/YYYY format correctly", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    const dates = [...new Set(draws.map(d => d.drawDate))].sort();
    expect(dates).toContain("2026-03-31");
    expect(dates).toContain("2026-04-04");
    // All dates should be YYYY-MM-DD
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("skips header/footer/disclaimer lines", () => {
    const draws = parseCashPopText(SAMPLE_TEXT);
    // Should not produce draws from non-data lines
    for (const d of draws) {
      expect(d.drawDate).not.toBe("");
      expect(d.mainNumbers[0]).not.toBeNaN();
    }
  });

  it("handles empty input", () => {
    expect(parseCashPopText("")).toEqual([]);
  });

  it("handles input with only headers", () => {
    const headerOnly = "Draw Date Morning Matinee Afternoon Evening Late Night\n1/49\tPages";
    expect(parseCashPopText(headerOnly)).toEqual([]);
  });
});
