/** Game type identifiers */
export const GAME_TYPES = [
  "fantasy_5", "powerball", "mega_millions", "florida_lotto",
  "cash4life", "pick_2", "pick_3", "pick_4", "pick_5"
] as const;

export type GameType = typeof GAME_TYPES[number];

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
}

export const FLORIDA_GAMES: Record<GameType, GameConfig> = {
  fantasy_5:     { id: "fantasy_5",     name: "Fantasy 5",      mainCount: 5, mainMax: 36, specialCount: 0, specialMax: 0,  isDigitGame: false, drawingsPerDay: 2, ticketPrice: 1 },
  powerball:     { id: "powerball",     name: "Powerball",      mainCount: 5, mainMax: 69, specialCount: 1, specialMax: 26, isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2 },
  mega_millions: { id: "mega_millions", name: "Mega Millions",  mainCount: 5, mainMax: 70, specialCount: 1, specialMax: 25, isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2 },
  florida_lotto: { id: "florida_lotto", name: "Florida Lotto",  mainCount: 6, mainMax: 53, specialCount: 0, specialMax: 0,  isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2 },
  cash4life:     { id: "cash4life",     name: "Cash4Life",      mainCount: 5, mainMax: 60, specialCount: 1, specialMax: 4,  isDigitGame: false, drawingsPerDay: 1, ticketPrice: 2 },
  pick_2:        { id: "pick_2",        name: "Pick 2",         mainCount: 2, mainMax: 9,  specialCount: 0, specialMax: 0,  isDigitGame: true,  drawingsPerDay: 2, ticketPrice: 1 },
  pick_3:        { id: "pick_3",        name: "Pick 3",         mainCount: 3, mainMax: 9,  specialCount: 0, specialMax: 0,  isDigitGame: true,  drawingsPerDay: 2, ticketPrice: 1 },
  pick_4:        { id: "pick_4",        name: "Pick 4",         mainCount: 4, mainMax: 9,  specialCount: 0, specialMax: 0,  isDigitGame: true,  drawingsPerDay: 2, ticketPrice: 1 },
  pick_5:        { id: "pick_5",        name: "Pick 5",         mainCount: 5, mainMax: 9,  specialCount: 0, specialMax: 0,  isDigitGame: true,  drawingsPerDay: 2, ticketPrice: 1 },
};

export const MODEL_NAMES = [
  "random",
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
