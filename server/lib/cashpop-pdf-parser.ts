/**
 * Cash Pop PDF History Parser
 *
 * Parses the official FL Lottery Cash Pop history PDF (cp.pdf) from
 * files.floridalottery.com/exptkt/cp.pdf
 *
 * PDF format: tabular rows with columns
 *   Draw Date | Morning | Matinee | Afternoon | Evening | Late Night
 * Each cell contains a single winning number (1-15).
 *
 * Each row produces 5 ParsedDraw entries (one per draw time), stored as:
 *   - gameType: "cash_pop"
 *   - mainNumbers: [N] (one-element array, the single winning number)
 *   - specialNumbers: []
 *   - drawTime: "morning" | "matinee" | "afternoon" | "evening" | "late_night"
 */

import type { ParsedDraw } from "./fl-lottery-scraper";

const DRAW_TIMES = ["morning", "matinee", "afternoon", "evening", "late_night"] as const;

/**
 * Parse a Cash Pop date string (M/D/YYYY) to YYYY-MM-DD.
 * The PDF uses formats like "4/4/2026" or "12/31/2025".
 */
function parseCashPopDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Parse the raw text output from the Cash Pop PDF into draw records.
 *
 * The text (from pdf-parse) is newline-delimited. Each data page starts with a
 * header line "Draw Date Morning Matinee Afternoon Evening Late Night" followed
 * by rows like "4/4/2026 10 3 11 5 8". Page footers ("1/49\tPages") are skipped.
 */
export function parseCashPopText(text: string): ParsedDraw[] {
  const draws: ParsedDraw[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip headers, footers, disclaimers
    if (line.startsWith("Draw Date")) continue;
    if (line.includes("Pages")) continue;
    if (line.includes("Please note")) continue;
    if (line.includes("Winning Numbers")) continue;
    if (line.includes("CASH POP")) continue;
    if (line.includes("FLORIDA LOTTERY")) continue;
    if (line.includes("Last Queried")) continue;
    if (line.includes("GMT")) continue;

    // Data row: "M/D/YYYY N N N N N"
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    const dateStr = parseCashPopDate(parts[0]);
    if (!dateStr) continue;

    const numbers = parts.slice(1, 6).map(s => parseInt(s, 10));
    if (numbers.some(n => isNaN(n) || n < 1 || n > 15)) continue;
    if (numbers.length !== 5) continue;

    for (let i = 0; i < 5; i++) {
      draws.push({
        drawDate: dateStr,
        mainNumbers: [numbers[i]],
        specialNumbers: [],
        drawTime: DRAW_TIMES[i],
      });
    }
  }

  return draws;
}

/**
 * Fetch and parse the official Cash Pop history PDF.
 * Returns draws sorted newest-first, deduped by date+drawTime.
 */
export async function fetchCashPopHistory(maxDraws: number = 0): Promise<ParsedDraw[]> {
  const url = "https://files.floridalottery.com/exptkt/cp.pdf";

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoOracle/2.0)" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuf = await response.arrayBuffer();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse(new Uint8Array(arrayBuf));
  const result = await parser.getText();
  parser.destroy();

  const text: string = typeof result === "string" ? result : (result as any)?.text ?? "";
  if (!text || text.length < 100) {
    throw new Error(`Insufficient data from Cash Pop PDF (${text.length} chars)`);
  }

  let draws = parseCashPopText(text);

  // Sort newest first
  draws.sort((a, b) => {
    const dateCmp = b.drawDate.localeCompare(a.drawDate);
    if (dateCmp !== 0) return dateCmp;
    return DRAW_TIMES.indexOf(a.drawTime as any) - DRAW_TIMES.indexOf(b.drawTime as any);
  });

  // Dedup by date + drawTime
  const seen = new Set<string>();
  draws = draws.filter(d => {
    const key = `${d.drawDate}-${d.drawTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (maxDraws > 0) {
    draws = draws.slice(0, maxDraws);
  }

  return draws;
}
