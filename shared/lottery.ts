/** Game type identifiers */
export const GAME_TYPES = [
  "fantasy_5", "powerball", "mega_millions", "florida_lotto",
  "cash4life", "pick_2", "pick_3", "pick_4", "pick_5"
] as const;

export type GameType = typeof GAME_TYPES[number];

/** Day of week: 0=Sunday, 1=Monday, ... 6=Saturday */
export interface DrawSchedule {
  /** Days of the week the game draws (0=Sun, 1=Mon, ... 6=Sat) */
  drawDays: number[];
  /** Draw times in ET (24h format), e.g. ["13:30", "23:00"] */
  drawTimes: string[];
  /** Whether the game has ended (e.g. Cash4Life ended Feb 2026) */
  ended?: boolean;
  /** Human-readable schedule description */
  description: string;
}

export interface GameConfig {
  id: GameType;
  name: string;
  mainCount: number;
  mainMax: number;
  specialCount: number;
  specialMax: number;
  isDigitGame: boolean;
  drawingsPerDay: number;
  ticketPrice: number; // in dollars
  schedule: DrawSchedule;
}

export const FLORIDA_GAMES: Record<GameType, GameConfig> = {
  fantasy_5: {
    id: "fantasy_5", name: "Fantasy 5", mainCount: 5, mainMax: 36,
    specialCount: 0, specialMax: 0, isDigitGame: false, drawingsPerDay: 2, ticketPrice: 1,
    schedule: { drawDays: [0, 1, 2, 3, 4, 5, 6], drawTimes: ["13:30", "23:00"], description: "Daily, Midday & Evening" },
  },
  powerball: {
    id: "powerball", name: "Powerball", mainCount: 5, mainMax: 69,
    specialCount: 1, specialMax: 26, isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2,
    schedule: { drawDays: [1, 3, 6], drawTimes: ["22:59"], description: "Mon, Wed, Sat at 10:59 PM ET" },
  },
  mega_millions: {
    id: "mega_millions", name: "Mega Millions", mainCount: 5, mainMax: 70,
    specialCount: 1, specialMax: 25, isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2,
    schedule: { drawDays: [2, 5], drawTimes: ["23:00"], description: "Tue, Fri at 11:00 PM ET" },
  },
  florida_lotto: {
    id: "florida_lotto", name: "Florida Lotto", mainCount: 6, mainMax: 53,
    specialCount: 0, specialMax: 0, isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2,
    schedule: { drawDays: [3, 6], drawTimes: ["23:15"], description: "Wed, Sat at 11:15 PM ET" },
  },
  cash4life: {
    id: "cash4life", name: "Cash4Life", mainCount: 5, mainMax: 60,
    specialCount: 1, specialMax: 4, isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2,
    schedule: { drawDays: [], drawTimes: [], ended: true, description: "Game ended February 21, 2026" },
  },
  pick_2: {
    id: "pick_2", name: "Pick 2", mainCount: 2, mainMax: 9,
    specialCount: 0, specialMax: 0, isDigitGame: true, drawingsPerDay: 2, ticketPrice: 1,
    schedule: { drawDays: [0, 1, 2, 3, 4, 5, 6], drawTimes: ["13:30", "23:00"], description: "Daily, Midday & Evening" },
  },
  pick_3: {
    id: "pick_3", name: "Pick 3", mainCount: 3, mainMax: 9,
    specialCount: 0, specialMax: 0, isDigitGame: true, drawingsPerDay: 2, ticketPrice: 1,
    schedule: { drawDays: [0, 1, 2, 3, 4, 5, 6], drawTimes: ["13:30", "23:00"], description: "Daily, Midday & Evening" },
  },
  pick_4: {
    id: "pick_4", name: "Pick 4", mainCount: 4, mainMax: 9,
    specialCount: 0, specialMax: 0, isDigitGame: true, drawingsPerDay: 2, ticketPrice: 1,
    schedule: { drawDays: [0, 1, 2, 3, 4, 5, 6], drawTimes: ["13:30", "23:00"], description: "Daily, Midday & Evening" },
  },
  pick_5: {
    id: "pick_5", name: "Pick 5", mainCount: 5, mainMax: 9,
    specialCount: 0, specialMax: 0, isDigitGame: true, drawingsPerDay: 2, ticketPrice: 1,
    schedule: { drawDays: [0, 1, 2, 3, 4, 5, 6], drawTimes: ["13:30", "23:00"], description: "Daily, Midday & Evening" },
  },
};

/** Get the next draw date/time for a game (in ET) */
function toETDate(utcDate: Date): Date {
  // Uses the runtime's Intl support to correctly apply America/New_York
  // offset including DST transitions. Works in both Node.js and modern browsers.
  const etStr = utcDate.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etStr);
}

export function getNextDrawDate(gameType: GameType): Date | null {
  const cfg = FLORIDA_GAMES[gameType];
  if (cfg.schedule.ended || cfg.schedule.drawDays.length === 0) return null;

  const etNow = toETDate(new Date());

  const lastDrawTime = cfg.schedule.drawTimes[cfg.schedule.drawTimes.length - 1];
  const [drawHour, drawMin] = lastDrawTime.split(":").map(Number);

  // Check today and next 7 days
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(etNow);
    candidate.setDate(candidate.getDate() + dayOffset);
    const dayOfWeek = candidate.getDay();

    if (cfg.schedule.drawDays.includes(dayOfWeek)) {
      candidate.setHours(drawHour, drawMin, 0, 0);

      // If today but draw time has passed, skip to next draw day
      if (dayOffset === 0 && candidate <= etNow) continue;

      return candidate;
    }
  }
  return null;
}

/** Format time remaining until a date */
export function formatTimeUntil(target: Date): string {
  const etNow = toETDate(new Date());
  const diff = target.getTime() - etNow.getTime();

  if (diff <= 0) return "Drawing now!";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const MODEL_NAMES = [
  "frequency_baseline",
  "poisson_standard",
  "poisson_short",
  "poisson_long",
  "hot_cold_70",
  "hot_cold_50",
  "balanced_hot_cold",
  "gap_analysis",
  "cooccurrence",
  "delta",
  "temporal_echo",
  "monte_carlo",
  "markov_chain",
  "bayesian",
  "quantum_entanglement",
  "cdm",
  "chi_square",
  "ai_oracle",
] as const;

export type ModelName = typeof MODEL_NAMES[number];

export interface PredictionResult {
  modelName: string;
  mainNumbers: number[];
  specialNumbers: number[];
  confidenceScore: number;
  metadata: Record<string, unknown>;
}

export interface TicketEntry {
  mainNumbers: number[];
  specialNumbers: number[];
  modelSource: string;
  confidence: number;
}
