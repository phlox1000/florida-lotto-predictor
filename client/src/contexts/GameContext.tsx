/**
 * GameContext — single source of truth for the currently selected game.
 *
 * Provides:
 *   - selectedGame / setSelectedGame
 *   - gameCfg (full GameConfig for the selected game)
 *   - nextDraw (Date | null)
 *   - countdown (live string, ET-aware, refreshed every second)
 *   - isDigitGame (convenience flag)
 *   - activeGames (all non-ended games)
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FLORIDA_GAMES,
  GAME_TYPES,
  type GameType,
  getNextDrawDate,
  formatTimeUntil,
} from "@shared/lottery";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameContextValue {
  selectedGame: GameType;
  setSelectedGame: (game: GameType) => void;
  gameCfg: (typeof FLORIDA_GAMES)[GameType];
  nextDraw: Date | null;
  countdown: string;
  isDigitGame: boolean;
  activeGames: (typeof FLORIDA_GAMES)[GameType][];
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GameContext = createContext<GameContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

const DEFAULT_GAME: GameType = "fantasy_5";
const STORAGE_KEY = "fl-oracle-selected-game";

function readStoredGame(): GameType {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && GAME_TYPES.includes(stored as GameType)) {
      return stored as GameType;
    }
  } catch {
    // ignore
  }
  return DEFAULT_GAME;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [selectedGame, setSelectedGameState] = useState<GameType>(readStoredGame);
  const [countdown, setCountdown] = useState<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeGames = useMemo(
    () =>
      GAME_TYPES.filter((g) => !FLORIDA_GAMES[g].schedule.ended).map(
        (g) => FLORIDA_GAMES[g]
      ),
    []
  );

  const gameCfg = FLORIDA_GAMES[selectedGame];
  const isDigitGame = gameCfg.isDigitGame;
  const nextDraw = useMemo(() => getNextDrawDate(selectedGame), [selectedGame]);

  // Persist selection
  const setSelectedGame = useCallback((game: GameType) => {
    setSelectedGameState(game);
    try {
      localStorage.setItem(STORAGE_KEY, game);
    } catch {
      // ignore
    }
  }, []);

  // Live countdown ticker
  useEffect(() => {
    function tick() {
      if (!nextDraw) {
        setCountdown("Game ended");
        return;
      }
      setCountdown(formatTimeUntil(nextDraw));
    }
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [nextDraw]);

  const value = useMemo<GameContextValue>(
    () => ({
      selectedGame,
      setSelectedGame,
      gameCfg,
      nextDraw,
      countdown,
      isDigitGame,
      activeGames,
    }),
    [selectedGame, setSelectedGame, gameCfg, nextDraw, countdown, isDigitGame, activeGames]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error("useGame must be used within a <GameProvider>");
  }
  return ctx;
}
