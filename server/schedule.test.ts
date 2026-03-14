import { describe, expect, it } from "vitest";
import { getNextDrawDate, formatTimeUntil, FLORIDA_GAMES, GAME_TYPES } from "../shared/lottery";

describe("Draw Schedule", () => {
  it("returns null for ended games (Cash4Life)", () => {
    const result = getNextDrawDate("cash4life");
    expect(result).toBeNull();
  });

  it("returns a future date for active games", () => {
    const result = getNextDrawDate("fantasy_5");
    // Fantasy 5 draws daily, so there should always be a next draw
    expect(result).not.toBeNull();
    if (result) {
      // The returned date should be in the future (or very close to now)
      const now = new Date();
      const etOffset = -5;
      const etNow = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
      expect(result.getTime()).toBeGreaterThan(etNow.getTime() - 60000); // within 1 min tolerance
    }
  });

  it("returns a date for Powerball (draws Mon/Wed/Sat)", () => {
    const result = getNextDrawDate("powerball");
    expect(result).not.toBeNull();
    if (result) {
      const day = result.getDay();
      // Powerball draws on Mon(1), Wed(3), Sat(6)
      expect([1, 3, 6]).toContain(day);
    }
  });

  it("returns a date for Mega Millions (draws Tue/Fri)", () => {
    const result = getNextDrawDate("mega_millions");
    expect(result).not.toBeNull();
    if (result) {
      const day = result.getDay();
      expect([2, 5]).toContain(day);
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
    const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const result = formatTimeUntil(past);
    expect(result).toBe("Drawing now!");
  });

  it("formats hours and minutes for near-future dates", () => {
    // Create a date ~3 hours from now in ET
    const now = new Date();
    const etOffset = -5;
    const etNow = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
    const future = new Date(etNow.getTime() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const result = formatTimeUntil(future);
    expect(result).toMatch(/\d+h \d+m/);
  });

  it("formats days for far-future dates", () => {
    const now = new Date();
    const etOffset = -5;
    const etNow = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
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

  it("has exactly 9 game types", () => {
    expect(GAME_TYPES.length).toBe(9);
  });
});
