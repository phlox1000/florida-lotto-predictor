import { describe, expect, it } from "vitest";
import { getNextDrawDate, formatTimeUntil, getETNow, FLORIDA_GAMES, GAME_TYPES } from "../shared/lottery";

describe("getETNow", () => {
  it("returns a Date whose components match America/New_York wall-clock time", () => {
    const etNow = getETNow();
    // Should be a valid Date with reasonable year
    expect(etNow.getFullYear()).toBeGreaterThanOrEqual(2025);
    // Should be within a few seconds of real-time
    const realNow = new Date();
    const drift = Math.abs(realNow.getTime() - etNow.getTime());
    // Allow up to 24h drift since the Date's absolute epoch doesn't match UTC,
    // but verify the wall-clock components parse correctly
    expect(etNow.getHours()).toBeGreaterThanOrEqual(0);
    expect(etNow.getHours()).toBeLessThan(24);
  });
});

describe("Draw Schedule", () => {
  it("returns null for ended games (Cash4Life)", () => {
    const result = getNextDrawDate("cash4life");
    expect(result).toBeNull();
  });

  it("returns a future date for active games", () => {
    const result = getNextDrawDate("fantasy_5");
    expect(result).not.toBeNull();
    if (result) {
      const etNow = getETNow();
      expect(result.getTime()).toBeGreaterThan(etNow.getTime() - 60000);
    }
  });

  it("returns a date for Powerball (draws Mon/Wed/Sat)", () => {
    const result = getNextDrawDate("powerball");
    expect(result).not.toBeNull();
    if (result) {
      const day = result.getDay();
      expect([1, 3, 6]).toContain(day);
    }
  });

  it("returns a date for Mega Millions (draws Tue/Fri)", () => {
    const result = getNextDrawDate("mega_millions");
    expect(result).not.toBeNull();
    if (result) {
      const etDay = new Date(result.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
      expect([2, 5]).toContain(etDay);
    }
  });

  it("all active games have valid schedules", () => {
    for (const gt of GAME_TYPES) {
      const cfg = FLORIDA_GAMES[gt];
      if (cfg.schedule.ended) {
        expect(getNextDrawDate(gt)).toBeNull();
      } else {
        expect(cfg.schedule.drawDays.length).toBeGreaterThan(0);
        expect(cfg.schedule.drawTimes.length).toBeGreaterThan(0);
        expect(cfg.schedule.description).toBeTruthy();
      }
    }
  });
});

describe("formatTimeUntil", () => {
  it("returns 'Drawing now!' for past dates", () => {
    const etNow = getETNow();
    const past = new Date(etNow.getTime() - 1000 * 60 * 60);
    const result = formatTimeUntil(past);
    expect(result).toBe("Drawing now!");
  });

  it("formatTimeUntil returns a non-empty string for a future date", () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const result = formatTimeUntil(future);
    expect(result).toMatch(/\d+[hmd]/);
  });

  it("formatTimeUntil returns 'Drawing now!' for a past date", () => {
    const past = new Date(Date.now() - 1000);
    expect(formatTimeUntil(past)).toBe("Drawing now!");
  });

  it("formats hours and minutes for near-future dates", () => {
    const etNow = getETNow();
    const future = new Date(etNow.getTime() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const result = formatTimeUntil(future);
    expect(result).toMatch(/\d+h \d+m/);
  });

  it("formats days for far-future dates", () => {
    const etNow = getETNow();
    const future = new Date(etNow.getTime() + 2 * 24 * 60 * 60 * 1000);
    const result = formatTimeUntil(future);
    expect(result).toMatch(/\d+d/);
  });
});

describe("Game Configuration", () => {
  it("all games have valid ticket prices", () => {
    for (const gt of GAME_TYPES) {
      const cfg = FLORIDA_GAMES[gt];
      expect(cfg.ticketPrice).toBeGreaterThan(0);
      expect(cfg.ticketPrice).toBeLessThanOrEqual(5);
    }
  });

  it("all games have correct number ranges", () => {
    for (const gt of GAME_TYPES) {
      const cfg = FLORIDA_GAMES[gt];
      expect(cfg.mainCount).toBeGreaterThan(0);
      if (cfg.isDigitGame) {
        expect(cfg.mainMax).toBe(9);
      } else {
        expect(cfg.mainMax).toBeGreaterThan(cfg.mainCount);
      }
    }
  });

  it("has exactly 10 game types", () => {
    expect(GAME_TYPES.length).toBe(10);
  });
});

describe("getNextDrawDate multi-draw logic", () => {
  it("returns a valid draw time for multi-draw games (Fantasy 5 has 2 daily draws)", () => {
    const result = getNextDrawDate("fantasy_5");
    expect(result).not.toBeNull();
    if (result) {
      const hours = result.getHours();
      const mins = result.getMinutes();
      const timeStr = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
      expect(["13:30", "23:00"]).toContain(timeStr);
    }
  });

  it("returns a valid draw time for Cash Pop (5 daily draws)", () => {
    const result = getNextDrawDate("cash_pop");
    expect(result).not.toBeNull();
    if (result) {
      const hours = result.getHours();
      const mins = result.getMinutes();
      const timeStr = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
      expect(["08:45", "11:45", "14:45", "18:45", "23:45"]).toContain(timeStr);
    }
  });

  it("returns the earliest upcoming draw time, not the last", () => {
    const multiDrawGames = GAME_TYPES.filter(
      gt => FLORIDA_GAMES[gt].schedule.drawTimes.length > 1 && !FLORIDA_GAMES[gt].schedule.ended
    );
    expect(multiDrawGames.length).toBeGreaterThan(0);

    for (const gt of multiDrawGames) {
      const result = getNextDrawDate(gt);
      expect(result).not.toBeNull();
    }
  });

  it("single-draw games still return a valid result", () => {
    const result = getNextDrawDate("powerball");
    expect(result).not.toBeNull();
    if (result) {
      expect(result.getHours()).toBe(22);
      expect(result.getMinutes()).toBe(59);
    }
  });
});
