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
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it("getNextDrawDate returns a future date for an active game", () => {
    const next = getNextDrawDate("fantasy_5");
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it("getNextDrawDate returns null for ended game", () => {
    expect(getNextDrawDate("cash4life")).toBeNull();
  });

  it("returns a date for Powerball (draws Mon/Wed/Sat)", () => {
    const result = getNextDrawDate("powerball");
    expect(result).not.toBeNull();
    if (result) {
      // Check day-of-week in ET since draws are scheduled in ET
      const etDay = new Date(result.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
      // Powerball draws on Mon(1), Wed(3), Sat(6)
      expect([1, 3, 6]).toContain(etDay);
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
    const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
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
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const result = formatTimeUntil(future);
    expect(result).toMatch(/\d+h \d+m/);
  });

  it("formats days for far-future dates", () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
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
