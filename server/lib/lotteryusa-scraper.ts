/**
 * LotteryUSA.com Scraper for Recent Florida Lottery Results
 * 
 * The official FL Lottery HTML data files (files.floridalottery.com/exptkt/)
 * are not reliably updated. This module scrapes lotteryusa.com for the most
 * recent 10 draws per game, which is always current.
 * 
 * URL patterns:
 *   Evening draws:  https://www.lotteryusa.com/florida/{game}/
 *   Midday draws:   https://www.lotteryusa.com/florida/midday-{game}/
 * 
 * HTML structure:
 *   Date:    <span class="c-draw-card__draw-date-sub">Mar 13, 2026</span>
 *   Main:    <li class="c-ball c-ball--sm">3</li>
 *   Special: <span class="c-ball c-ball--red c-ball--sm">12</span> (inside c-result__bonus)
 *   Fireball: <span class="c-ball c-ball--fire c-ball--sm">6</span> (Pick games, ignored)
 */

import type { GameType } from "@shared/lottery";

export interface ParsedDraw {
  drawDate: string;       // YYYY-MM-DD
  mainNumbers: number[];
  specialNumbers: number[];
  drawTime: string;       // "evening" | "midday"
}

/** Map game types to their lotteryusa.com URL slugs */
const GAME_SLUGS: Record<string, { evening: string; midday?: string }> = {
  fantasy_5:    { evening: "fantasy-5",    midday: "fantasy-5-midday" },
  powerball:    { evening: "powerball" },
  mega_millions:{ evening: "mega-millions" },
  florida_lotto:{ evening: "lotto" },
  cash4life:    { evening: "cash4life" },
  pick_5:       { evening: "pick-5",       midday: "pick-5-midday" },
  pick_4:       { evening: "pick-4",       midday: "midday-pick-4" },
  pick_3:       { evening: "pick-3",       midday: "midday-pick-3" },
  pick_2:       { evening: "pick-2",       midday: "pick-2-midday" },
  // Cash Pop: single-number game. Only evening draw scraped for now.
  cash_pop:     { evening: "cash-pop-evening" },
};

/** Number of main balls per game (excluding special balls) */
const MAIN_COUNTS: Record<string, number> = {
  fantasy_5: 5,
  powerball: 5,
  mega_millions: 5,
  florida_lotto: 6,
  cash4life: 5,
  pick_5: 5,
  pick_4: 4,
  pick_3: 3,
  pick_2: 2,
  cash_pop: 1,
};

/** Games that have a special ball (PB, MB, CB) */
const HAS_SPECIAL: Set<string> = new Set(["powerball", "mega_millions", "cash4life"]);

const BASE_URL = "https://www.lotteryusa.com/florida";

/**
 * Parse a date like "Mar 13, 2026" to "2026-03-13"
 */
function parseDateStr(dateStr: string): string {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const match = dateStr.trim().match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) return "";
  const [, mon, day, year] = match;
  const mm = months[mon];
  if (!mm) return "";
  return `${year}-${mm}-${day.padStart(2, "0")}`;
}

/**
 * Parse draw cards from lotteryusa.com HTML.
 * Each card contains a date and a list of ball numbers.
 * Special balls (PB, MB, CB) have class "c-ball--red".
 * Fireball numbers have class "c-ball--fire" (we ignore these).
 */
function parseDrawCards(html: string, gameType: string, drawTime: string): ParsedDraw[] {
  const draws: ParsedDraw[] = [];
  const mainCount = MAIN_COUNTS[gameType] || 5;
  const hasSpecial = HAS_SPECIAL.has(gameType);

  // Find each draw card: date + ball list (only first ball-box per card = main draw)
  // Pattern: date-sub span followed by the first ball-list
  const cardRegex = /c-draw-card__draw-date-sub">\s*(.*?)\s*<\/span>[\s\S]*?c-draw-card__ball-list">([\s\S]*?)<\/ul>/g;
  
  let match;
  const seenDates = new Set<string>();
  
  while ((match = cardRegex.exec(html)) !== null) {
    const dateStr = parseDateStr(match[1]);
    if (!dateStr) continue;
    
    // Skip duplicate dates (can happen with Double Play sections)
    const dateKey = `${dateStr}-${drawTime}`;
    if (seenDates.has(dateKey)) continue;
    seenDates.add(dateKey);
    
    const ballsHtml = match[2];
    
    // Extract all ball numbers with their classes
    const ballRegex = /class="(c-ball[^"]*)"[^>]*>\s*(\d+)\s*</g;
    const mainNumbers: number[] = [];
    const specialNumbers: number[] = [];
    
    let ballMatch;
    while ((ballMatch = ballRegex.exec(ballsHtml)) !== null) {
      const cls = ballMatch[1];
      const num = parseInt(ballMatch[2], 10);
      
      // Skip fireball numbers
      if (cls.includes("c-ball--fire")) continue;
      
      // Special balls: red (Powerball), yellow (Mega Ball), green (Cash Ball)
      if (cls.includes("c-ball--red") || cls.includes("c-ball--yellow") || cls.includes("c-ball--green")) {
        if (hasSpecial) {
          specialNumbers.push(num);
        }
      } else {
        mainNumbers.push(num);
      }
    }
    
    // Validate we got the right number of main balls
    if (mainNumbers.length === mainCount) {
      draws.push({
        drawDate: dateStr,
        mainNumbers,
        specialNumbers: hasSpecial ? specialNumbers.slice(0, 1) : [],
        drawTime,
      });
    }
  }
  
  return draws;
}

/**
 * Fetch a page from lotteryusa.com with proper headers.
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  
  return response.text();
}

/**
 * Fetch the latest draws for a specific game from lotteryusa.com.
 * Returns up to 10 most recent draws (evening + midday combined for Pick games).
 */
export async function fetchRecentDraws(gameType: GameType): Promise<ParsedDraw[]> {
  const slugs = GAME_SLUGS[gameType];
  if (!slugs) {
    throw new Error(`Unknown game type: ${gameType}`);
  }

  const allDraws: ParsedDraw[] = [];

  // Fetch evening draws
  try {
    const url = `${BASE_URL}/${slugs.evening}/`;
    const html = await fetchPage(url);
    const draws = parseDrawCards(html, gameType, "evening");
    allDraws.push(...draws);
  } catch (e) {
    console.warn(`[LotteryUSA] Failed to fetch evening ${gameType}:`, e);
  }

  // Fetch midday draws (for Pick games)
  if (slugs.midday) {
    try {
      const url = `${BASE_URL}/${slugs.midday}/`;
      const html = await fetchPage(url);
      const draws = parseDrawCards(html, gameType, "midday");
      allDraws.push(...draws);
    } catch (e) {
      console.warn(`[LotteryUSA] Failed to fetch midday ${gameType}:`, e);
    }
  }

  // Sort by date descending
  allDraws.sort((a, b) => b.drawDate.localeCompare(a.drawDate));

  return allDraws;
}

/**
 * Fetch latest draws for ALL supported games from lotteryusa.com.
 */
export async function fetchAllGamesRecent(): Promise<Record<string, ParsedDraw[]>> {
  const results: Record<string, ParsedDraw[]> = {};
  
  for (const gameType of Object.keys(GAME_SLUGS)) {
    try {
      results[gameType] = await fetchRecentDraws(gameType as GameType);
    } catch (e) {
      console.warn(`[LotteryUSA] Failed to fetch ${gameType}:`, e);
      results[gameType] = [];
    }
  }
  
  return results;
}

// Export for testing
export { parseDateStr, parseDrawCards, GAME_SLUGS, MAIN_COUNTS };
