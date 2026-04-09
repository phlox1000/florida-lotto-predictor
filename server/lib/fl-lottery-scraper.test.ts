import { describe, expect, it, vi, beforeAll } from "vitest";
import { extractFontTexts, parseDate, isDate, isNumber, FILE_CODES } from "./fl-lottery-scraper";

describe("fl-lottery-scraper utilities", () => {
  describe("extractFontTexts", () => {
    it("extracts text from simple font tags", () => {
      const html = '<font size="2">Hello</font><font size="1">World</font>';
      expect(extractFontTexts(html)).toEqual(["Hello", "World"]);
    });

    it("strips inner HTML tags", () => {
      const html = '<font size="2"><b>Bold</b> text</font>';
      expect(extractFontTexts(html)).toEqual(["Bold text"]);
    });

    it("handles &nbsp; entities", () => {
      const html = '<font size="2">Hello&nbsp;World</font>';
      expect(extractFontTexts(html)).toEqual(["Hello World"]);
    });

    it("skips empty font tags", () => {
      const html = '<font size="2">  </font><font size="2">Data</font>';
      expect(extractFontTexts(html)).toEqual(["Data"]);
    });

    it("handles large HTML efficiently", () => {
      // Build a large HTML string
      let html = "";
      for (let i = 0; i < 10000; i++) {
        html += `<font size="2">${i}</font>`;
      }
      const start = Date.now();
      const result = extractFontTexts(html);
      const elapsed = Date.now() - start;
      expect(result).toHaveLength(10000);
      expect(elapsed).toBeLessThan(1000); // Should be fast
    });
  });

  describe("parseDate", () => {
    it("parses MM/DD/YY format for 2000s", () => {
      expect(parseDate("08/26/25")).toBe("2025-08-26");
    });

    it("parses MM/DD/YY format for 1900s", () => {
      expect(parseDate("01/23/95")).toBe("1995-01-23");
    });

    it("handles year boundary at 80", () => {
      expect(parseDate("06/15/80")).toBe("1980-06-15");
      expect(parseDate("06/15/79")).toBe("2079-06-15");
    });

    it("returns empty string for invalid format", () => {
      expect(parseDate("invalid")).toBe("");
      expect(parseDate("2025-08-26")).toBe("");
    });
  });

  describe("isDate", () => {
    it("recognizes valid date patterns", () => {
      expect(isDate("08/26/25")).toBe(true);
      expect(isDate("01/01/00")).toBe(true);
    });

    it("rejects invalid patterns", () => {
      expect(isDate("8/26/25")).toBe(false);
      expect(isDate("2025-08-26")).toBe(false);
      expect(isDate("hello")).toBe(false);
      expect(isDate("123")).toBe(false);
    });
  });

  describe("isNumber", () => {
    it("recognizes numbers", () => {
      expect(isNumber("0")).toBe(true);
      expect(isNumber("42")).toBe(true);
      expect(isNumber("123")).toBe(true);
    });

    it("rejects non-numbers", () => {
      expect(isNumber("abc")).toBe(false);
      expect(isNumber("-1")).toBe(false);
      expect(isNumber("1.5")).toBe(false);
      expect(isNumber("")).toBe(false);
    });
  });

  describe("FILE_CODES", () => {
    it("has entries for all 9 Florida Lottery games", () => {
      const expectedGames = [
        "fantasy_5", "powerball", "mega_millions", "florida_lotto",
        "cash4life", "pick_5", "pick_4", "pick_3", "pick_2",
      ];
      for (const game of expectedGames) {
        expect(FILE_CODES).toHaveProperty(game);
      }
    });

    it("maps to correct file codes", () => {
      expect(FILE_CODES.fantasy_5).toBe("ff");
      expect(FILE_CODES.powerball).toBe("pb");
      expect(FILE_CODES.mega_millions).toBe("mmil");
      expect(FILE_CODES.florida_lotto).toBe("l6");
      expect(FILE_CODES.cash4life).toBe("c4l");
    });
  });
});

const RUN_LIVE = process.env.RUN_LIVE_TESTS === "true";
describe.skipIf(!RUN_LIVE)("fl-lottery-scraper integration (live fetch)", () => {
  // These tests hit the real FL Lottery servers — enable with RUN_LIVE_TESTS=true
  // They verify the scraper can parse actual data correctly
  
  it("fetches and parses Fantasy 5 draws", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("fantasy_5" as any, 10);
    
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.length).toBeLessThanOrEqual(10);
    
    for (const draw of draws) {
      expect(draw.drawDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(draw.mainNumbers).toHaveLength(5);
      for (const n of draw.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(36);
      }
      expect(draw.specialNumbers).toEqual([]);
      expect(draw.drawTime).toBe("evening");
    }
  }, 30000);

  it("fetches and parses Powerball draws with special number", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("powerball" as any, 5);
    
    expect(draws.length).toBeGreaterThan(0);
    
    for (const draw of draws) {
      expect(draw.mainNumbers).toHaveLength(5);
      for (const n of draw.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(69);
      }
      expect(draw.specialNumbers).toHaveLength(1);
      expect(draw.specialNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(draw.specialNumbers[0]).toBeLessThanOrEqual(26);
    }
  }, 30000);

  it("fetches and parses Mega Millions draws with MB", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("mega_millions" as any, 5);
    
    expect(draws.length).toBeGreaterThan(0);
    
    for (const draw of draws) {
      expect(draw.mainNumbers).toHaveLength(5);
      expect(draw.specialNumbers).toHaveLength(1);
      expect(draw.specialNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(draw.specialNumbers[0]).toBeLessThanOrEqual(25);
    }
  }, 30000);

  it("fetches and parses Cash4Life draws with CB", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("cash4life" as any, 5);
    
    expect(draws.length).toBeGreaterThan(0);
    
    for (const draw of draws) {
      expect(draw.mainNumbers).toHaveLength(5);
      expect(draw.specialNumbers).toHaveLength(1);
      expect(draw.specialNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(draw.specialNumbers[0]).toBeLessThanOrEqual(4);
    }
  }, 30000);

  it("fetches and parses Pick 3 draws with midday/evening", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("pick_3" as any, 20);
    
    expect(draws.length).toBeGreaterThan(0);
    
    const hasEvening = draws.some(d => d.drawTime === "evening");
    const hasMidday = draws.some(d => d.drawTime === "midday");
    expect(hasEvening || hasMidday).toBe(true);
    
    for (const draw of draws) {
      expect(draw.mainNumbers).toHaveLength(3);
      for (const n of draw.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(9);
      }
      expect(draw.specialNumbers).toEqual([]);
    }
  }, 30000);

  it("fetches and parses Florida Lotto draws (6 numbers)", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("florida_lotto" as any, 5);
    
    expect(draws.length).toBeGreaterThan(0);
    
    for (const draw of draws) {
      expect(draw.mainNumbers).toHaveLength(6);
      for (const n of draw.mainNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(53);
      }
      expect(draw.specialNumbers).toEqual([]);
    }
  }, 30000);

  it("returns draws sorted by date descending", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("fantasy_5" as any, 20);
    
    for (let i = 1; i < draws.length; i++) {
      expect(draws[i - 1].drawDate >= draws[i].drawDate).toBe(true);
    }
  }, 30000);

  it("respects maxDraws limit", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    const draws = await fetchHistoricalDraws("fantasy_5" as any, 3);
    expect(draws.length).toBeLessThanOrEqual(3);
  }, 30000);

  it("throws for unknown game type", async () => {
    const { fetchHistoricalDraws } = await import("./fl-lottery-scraper");
    await expect(fetchHistoricalDraws("invalid_game" as any)).rejects.toThrow("Unknown game type");
  });
});
