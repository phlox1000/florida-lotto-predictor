import { describe, it, expect } from "vitest";
import { parseDateStr, parseDrawCards, GAME_SLUGS, MAIN_COUNTS } from "./lotteryusa-scraper";

describe("lotteryusa-scraper", () => {
  describe("parseDateStr", () => {
    it("parses standard date format", () => {
      expect(parseDateStr("Mar 13, 2026")).toBe("2026-03-13");
    });
    it("parses single-digit day", () => {
      expect(parseDateStr("Jan 5, 2025")).toBe("2025-01-05");
    });
    it("parses date without comma", () => {
      expect(parseDateStr("Dec 25 2024")).toBe("2024-12-25");
    });
    it("returns empty for invalid date", () => {
      expect(parseDateStr("Invalid")).toBe("");
    });
    it("returns empty for empty string", () => {
      expect(parseDateStr("")).toBe("");
    });
  });

  describe("parseDrawCards - Fantasy 5", () => {
    const html = `
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-dow">Friday,</span>
            <span class="c-draw-card__draw-date-sub">Mar 13, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">3</li>
                <li class="c-ball c-ball--sm">11</li>
                <li class="c-ball c-ball--sm">12</li>
                <li class="c-ball c-ball--sm">23</li>
                <li class="c-ball c-ball--sm">32</li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-dow">Thursday,</span>
            <span class="c-draw-card__draw-date-sub">Mar 12, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">11</li>
                <li class="c-ball c-ball--sm">13</li>
                <li class="c-ball c-ball--sm">15</li>
                <li class="c-ball c-ball--sm">31</li>
                <li class="c-ball c-ball--sm">33</li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses multiple Fantasy 5 draws", () => {
      const draws = parseDrawCards(html, "fantasy_5", "evening");
      expect(draws).toHaveLength(2);
      expect(draws[0].drawDate).toBe("2026-03-13");
      expect(draws[0].mainNumbers).toEqual([3, 11, 12, 23, 32]);
      expect(draws[0].specialNumbers).toEqual([]);
      expect(draws[0].drawTime).toBe("evening");
      expect(draws[1].drawDate).toBe("2026-03-12");
      expect(draws[1].mainNumbers).toEqual([11, 13, 15, 31, 33]);
    });
  });

  describe("parseDrawCards - Powerball with special ball", () => {
    const html = `
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-sub">Mar 11, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <p class="c-draw-card__ball-title">Main draw</p>
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">3</li>
                <li class="c-ball c-ball--sm">6</li>
                <li class="c-ball c-ball--sm">55</li>
                <li class="c-ball c-ball--sm">58</li>
                <li class="c-ball c-ball--sm">63</li>
                <li class="c-result__bonus">
                  <abbr class="c-result__bonus-abbr" title="Powerball">PB</abbr>
                  <span class="c-ball c-ball--red c-ball--sm">12</span>
                </li>
                <li class="c-result__multiplier">Power Play: 2</li>
              </ul>
            </div>
            <div class="c-draw-card__ball-box">
              <p class="c-draw-card__ball-title">Double Play</p>
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">6</li>
                <li class="c-ball c-ball--sm">7</li>
                <li class="c-ball c-ball--sm">42</li>
                <li class="c-ball c-ball--sm">43</li>
                <li class="c-ball c-ball--sm">59</li>
                <li class="c-result__bonus">
                  <span class="c-ball c-ball--red c-ball--sm">21</span>
                </li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses Powerball with special ball correctly", () => {
      const draws = parseDrawCards(html, "powerball", "evening");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([3, 6, 55, 58, 63]);
      expect(draws[0].specialNumbers).toEqual([12]);
      expect(draws[0].drawDate).toBe("2026-03-11");
    });

    it("skips Double Play section (only takes first ball-list)", () => {
      const draws = parseDrawCards(html, "powerball", "evening");
      // Should only have the main draw, not the Double Play
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).not.toContain(42);
    });
  });

  describe("parseDrawCards - Pick 3 with Fireball", () => {
    const html = `
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-sub">Mar 13, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">3</li>
                <li class="c-ball c-ball--sm">3</li>
                <li class="c-ball c-ball--sm">4</li>
                <li class="c-result__bonus">
                  <abbr class="c-result__bonus-abbr" title="Fireball">FB</abbr>
                  <span class="c-ball c-ball--fire c-ball--sm">6</span>
                </li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses Pick 3 numbers and ignores Fireball", () => {
      const draws = parseDrawCards(html, "pick_3", "evening");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([3, 3, 4]);
      expect(draws[0].specialNumbers).toEqual([]);
    });
  });

  describe("parseDrawCards - Mega Millions (yellow ball)", () => {
    const html = `
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-sub">Mar 13, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">6</li>
                <li class="c-ball c-ball--sm">19</li>
                <li class="c-ball c-ball--sm">36</li>
                <li class="c-ball c-ball--sm">40</li>
                <li class="c-ball c-ball--sm">55</li>
                <li class="c-result__bonus">
                  <abbr class="c-result__bonus-abbr" title="Mega Ball">MB</abbr>
                  <span class="c-ball c-ball--yellow c-ball--sm">9</span>
                </li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses Mega Millions with yellow Mega Ball", () => {
      const draws = parseDrawCards(html, "mega_millions", "evening");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([6, 19, 36, 40, 55]);
      expect(draws[0].specialNumbers).toEqual([9]);
    });
  });

  describe("parseDrawCards - Cash4Life (green ball)", () => {
    const html = `
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-sub">Mar 13, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">20</li>
                <li class="c-ball c-ball--sm">25</li>
                <li class="c-ball c-ball--sm">30</li>
                <li class="c-ball c-ball--sm">52</li>
                <li class="c-ball c-ball--sm">55</li>
                <li class="c-result__bonus">
                  <abbr class="c-result__bonus-abbr" title="Cash Ball">CB</abbr>
                  <span class="c-ball c-ball--green c-ball--sm">4</span>
                </li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses Cash4Life with green Cash Ball", () => {
      const draws = parseDrawCards(html, "cash4life", "evening");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([20, 25, 30, 52, 55]);
      expect(draws[0].specialNumbers).toEqual([4]);
    });
  });

  describe("parseDrawCards - Florida Lotto (6 numbers)", () => {
    const html = `
      <tr class="c-draw-card">
        <th class="c-draw-card__date" scope="row">
          <time class="c-draw-card__draw-date">
            <span class="c-draw-card__draw-date-sub">Mar 11, 2026</span>
          </time>
        </th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <p class="c-draw-card__ball-title">Main draw</p>
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">9</li>
                <li class="c-ball c-ball--sm">20</li>
                <li class="c-ball c-ball--sm">21</li>
                <li class="c-ball c-ball--sm">22</li>
                <li class="c-ball c-ball--sm">31</li>
                <li class="c-ball c-ball--sm">46</li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses Florida Lotto with 6 main numbers", () => {
      const draws = parseDrawCards(html, "florida_lotto", "evening");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([9, 20, 21, 22, 31, 46]);
      expect(draws[0].specialNumbers).toEqual([]);
    });
  });

  describe("GAME_SLUGS configuration", () => {
    it("has slugs for all 9 games", () => {
      const games = ["fantasy_5", "powerball", "mega_millions", "florida_lotto", "cash4life", "pick_2", "pick_3", "pick_4", "pick_5"];
      for (const game of games) {
        expect(GAME_SLUGS[game]).toBeDefined();
        expect(GAME_SLUGS[game].evening).toBeTruthy();
      }
    });

    it("has midday slugs for Pick games and Fantasy 5", () => {
      expect(GAME_SLUGS.pick_2.midday).toBe("pick-2-midday");
      expect(GAME_SLUGS.pick_3.midday).toBe("midday-pick-3");
      expect(GAME_SLUGS.pick_4.midday).toBe("midday-pick-4");
      expect(GAME_SLUGS.pick_5.midday).toBe("pick-5-midday");
      expect(GAME_SLUGS.fantasy_5.midday).toBe("fantasy-5-midday");
    });

    it("does not have midday slugs for non-Pick games", () => {
      expect(GAME_SLUGS.powerball.midday).toBeUndefined();
      expect(GAME_SLUGS.mega_millions.midday).toBeUndefined();
      expect(GAME_SLUGS.florida_lotto.midday).toBeUndefined();
    });
  });

  describe("MAIN_COUNTS configuration", () => {
    it("has correct main counts for all games", () => {
      expect(MAIN_COUNTS.fantasy_5).toBe(5);
      expect(MAIN_COUNTS.powerball).toBe(5);
      expect(MAIN_COUNTS.mega_millions).toBe(5);
      expect(MAIN_COUNTS.florida_lotto).toBe(6);
      expect(MAIN_COUNTS.cash4life).toBe(5);
      expect(MAIN_COUNTS.pick_5).toBe(5);
      expect(MAIN_COUNTS.pick_4).toBe(4);
      expect(MAIN_COUNTS.pick_3).toBe(3);
      expect(MAIN_COUNTS.pick_2).toBe(2);
    });
  });

  describe("parseDrawCards - duplicate date handling", () => {
    const html = `
      <tr class="c-draw-card">
        <th><time class="c-draw-card__draw-date"><span class="c-draw-card__draw-date-sub">Mar 13, 2026</span></time></th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">1</li>
                <li class="c-ball c-ball--sm">2</li>
                <li class="c-ball c-ball--sm">3</li>
                <li class="c-ball c-ball--sm">4</li>
                <li class="c-ball c-ball--sm">5</li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
      <tr class="c-draw-card">
        <th><time class="c-draw-card__draw-date"><span class="c-draw-card__draw-date-sub">Mar 13, 2026</span></time></th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">6</li>
                <li class="c-ball c-ball--sm">7</li>
                <li class="c-ball c-ball--sm">8</li>
                <li class="c-ball c-ball--sm">9</li>
                <li class="c-ball c-ball--sm">10</li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("deduplicates draws with same date and draw time", () => {
      const draws = parseDrawCards(html, "fantasy_5", "evening");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("parseDrawCards - Pick 2", () => {
    const html = `
      <tr class="c-draw-card">
        <th><time class="c-draw-card__draw-date"><span class="c-draw-card__draw-date-sub">Mar 14, 2026</span></time></th>
        <td class="c-draw-card__result">
          <div class="c-draw-card__draws">
            <div class="c-draw-card__ball-box">
              <ul class="c-result c-draw-card__ball-list">
                <li class="c-ball c-ball--sm">8</li>
                <li class="c-ball c-ball--sm">1</li>
                <li class="c-result__bonus">
                  <abbr class="c-result__bonus-abbr" title="Fireball">FB</abbr>
                  <span class="c-ball c-ball--fire c-ball--sm">8</span>
                </li>
              </ul>
            </div>
          </div>
        </td>
      </tr>
    `;

    it("parses Pick 2 with 2 main numbers, ignoring fireball", () => {
      const draws = parseDrawCards(html, "pick_2", "midday");
      expect(draws).toHaveLength(1);
      expect(draws[0].mainNumbers).toEqual([8, 1]);
      expect(draws[0].specialNumbers).toEqual([]);
      expect(draws[0].drawTime).toBe("midday");
    });
  });
});
