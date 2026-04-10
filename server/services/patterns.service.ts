/** Pure analysis algorithms — no DB access, no router concerns. */

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

interface DrawRow {
  id: number;
  mainNumbers: unknown;
  specialNumbers: unknown;
  drawDate: number;
  drawTime: string | null;
}

interface GameConfig {
  mainMax: number;
  specialMax: number;
  specialCount: number;
}

export interface FrequencyEntry { number: number; count: number; percentage: number }
export interface StreakEntry { number: number; currentStreak: number; streakType: "hot" | "cold"; maxHotStreak: number; maxColdStreak: number }
export interface OverdueEntry { number: number; drawsSinceLastAppearance: number; averageGap: number }
export interface PairEntry { numberA: number; numberB: number; count: number; percentage: number }

export interface PatternAnalysis {
  frequency: FrequencyEntry[];
  streaks: StreakEntry[];
  overdue: OverdueEntry[];
  pairs: PairEntry[];
  specialFrequency?: FrequencyEntry[];
  drawCount: number;
}

export function analyzePatterns(draws: DrawRow[], cfg: GameConfig): PatternAnalysis {
  if (draws.length === 0) return { frequency: [], streaks: [], overdue: [], pairs: [], drawCount: 0 };

  const allMain = draws.map(d => d.mainNumbers as number[]);
  const allSpecial = draws.map(d => d.specialNumbers as number[]);
  const pool = range(1, cfg.mainMax);

  // --- Frequency analysis ---
  const freqMap = new Map<number, number>();
  for (const nums of allMain) for (const n of nums) freqMap.set(n, (freqMap.get(n) || 0) + 1);
  const frequency: FrequencyEntry[] = pool.map(n => ({
    number: n,
    count: freqMap.get(n) || 0,
    percentage: ((freqMap.get(n) || 0) / draws.length) * 100,
  })).sort((a, b) => b.count - a.count);

  // --- Hot/Cold streaks ---
  const streaks: StreakEntry[] = [];
  for (const n of pool) {
    let currentStreak = 0;
    let streakType: "hot" | "cold" = "cold";
    let maxHot = 0, maxCold = 0, tempHot = 0, tempCold = 0;
    const chronological = [...allMain].reverse();
    for (const nums of chronological) {
      if (nums.includes(n)) {
        tempHot++;
        if (tempCold > maxCold) maxCold = tempCold;
        tempCold = 0;
      } else {
        tempCold++;
        if (tempHot > maxHot) maxHot = tempHot;
        tempHot = 0;
      }
    }
    if (tempHot > maxHot) maxHot = tempHot;
    if (tempCold > maxCold) maxCold = tempCold;
    const recentFirst = allMain;
    if (recentFirst[0]?.includes(n)) {
      streakType = "hot";
      for (const nums of recentFirst) {
        if (nums.includes(n)) currentStreak++;
        else break;
      }
    } else {
      streakType = "cold";
      for (const nums of recentFirst) {
        if (!nums.includes(n)) currentStreak++;
        else break;
      }
    }
    streaks.push({ number: n, currentStreak, streakType, maxHotStreak: maxHot, maxColdStreak: maxCold });
  }
  streaks.sort((a, b) => b.currentStreak - a.currentStreak);

  // --- Overdue numbers ---
  const overdue: OverdueEntry[] = pool.map(n => {
    let gap = draws.length;
    for (let i = 0; i < allMain.length; i++) {
      if (allMain[i].includes(n)) { gap = i; break; }
    }
    return { number: n, drawsSinceLastAppearance: gap, averageGap: draws.length / Math.max(1, freqMap.get(n) || 1) };
  }).sort((a, b) => b.drawsSinceLastAppearance - a.drawsSinceLastAppearance);

  // --- Top pairs (co-occurrence) ---
  const pairMap = new Map<string, number>();
  for (const nums of allMain) {
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${Math.min(nums[i], nums[j])}-${Math.max(nums[i], nums[j])}`;
        pairMap.set(key, (pairMap.get(key) || 0) + 1);
      }
    }
  }
  const pairs: PairEntry[] = [...pairMap.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("-").map(Number);
      return { numberA: a, numberB: b, count, percentage: (count / draws.length) * 100 };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // --- Special number frequency (if applicable) ---
  let specialFrequency: FrequencyEntry[] | undefined;
  if (cfg.specialCount > 0) {
    const specPool = range(1, cfg.specialMax);
    const specFreqMap = new Map<number, number>();
    for (const nums of allSpecial) for (const n of nums) specFreqMap.set(n, (specFreqMap.get(n) || 0) + 1);
    specialFrequency = specPool.map(n => ({
      number: n,
      count: specFreqMap.get(n) || 0,
      percentage: ((specFreqMap.get(n) || 0) / draws.length) * 100,
    })).sort((a, b) => b.count - a.count);
  }

  return { frequency, streaks, overdue, pairs, specialFrequency, drawCount: draws.length };
}

export interface HeatmapResult {
  grid: Array<{ number: number; hits: boolean[]; totalHits: number }>;
  dates: string[];
  numbers: number[];
  hotNumbers: Array<{ number: number; totalHits: number; maxConsecutive: number }>;
  drawCount: number;
  dateCount: number;
}

export function buildHeatmap(draws: DrawRow[], cfg: GameConfig): HeatmapResult {
  if (draws.length === 0) return { grid: [], numbers: [], dates: [], hotNumbers: [], drawCount: 0, dateCount: 0 };

  const dateMap: Array<{ date: string; numbers: number[]; specialNumbers: number[] }> = [];
  for (const draw of draws) {
    const dateStr = new Date(draw.drawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    const drawTime = draw.drawTime || "evening";
    const label = draws.some(d => d.drawDate === draw.drawDate && d.id !== draw.id)
      ? `${dateStr} (${drawTime})`
      : dateStr;
    dateMap.push({
      date: label,
      numbers: draw.mainNumbers as number[],
      specialNumbers: (draw.specialNumbers as number[]) || [],
    });
  }

  const recentDates = dateMap.slice(0, 50);
  const dates = recentDates.map(d => d.date);

  const pool = range(1, cfg.mainMax);

  const grid = pool.map(num => ({
    number: num,
    hits: recentDates.map(d => d.numbers.includes(num)),
    totalHits: recentDates.filter(d => d.numbers.includes(num)).length,
  }));

  const hotNumbers = grid
    .map(g => {
      let maxConsecutive = 0, current = 0;
      for (const hit of g.hits) {
        if (hit) { current++; maxConsecutive = Math.max(maxConsecutive, current); }
        else current = 0;
      }
      return { number: g.number, totalHits: g.totalHits, maxConsecutive };
    })
    .sort((a, b) => b.totalHits - a.totalHits);

  return { grid, dates, numbers: pool, hotNumbers, drawCount: draws.length, dateCount: recentDates.length };
}
