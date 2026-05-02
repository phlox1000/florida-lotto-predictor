import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GameType } from '@florida-lotto/shared';
import {
  createEmptyDashboardState,
  loadDashboardState,
  type DashboardState,
  saveDashboardState,
  recordAppSession,
  recordTabOpen as recTab,
  recordAnalyzeGenerate as recGen,
  recordGamePicked as recGame,
  recordResultCheck as recCheck,
} from './dashboardActivity';

export type DashboardContextValue = {
  state: DashboardState;
  ready: boolean;
  refresh: () => Promise<void>;
  recordTabOpen: (tab: 'home' | 'analyze' | 'generate' | 'track' | 'models', game: GameType | null) => void;
  recordAnalyzeGenerate: (game: GameType | null) => void;
  recordGamePicked: (game: GameType) => void;
  recordResultCheck: (gameNameHint?: string) => void;
};

const DashboardStateContext = createContext<DashboardContextValue | null>(null);

export function DashboardStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState>(() => createEmptyDashboardState());
  const appSessionRef = useRef(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const s = await loadDashboardState();
    setState(s);
  }, []);

  useEffect(() => {
    (async () => {
      const initial = await loadDashboardState();
      if (!appSessionRef.current) {
        appSessionRef.current = true;
        const withSession = recordAppSession(initial);
        await saveDashboardState(withSession);
        setState(withSession);
      } else {
        setState(initial);
      }
      setReady(true);
    })();
  }, []);

  const recordTabOpen: DashboardContextValue['recordTabOpen'] = useCallback((tab, game) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = recTab(prev, tab, game);
      void saveDashboardState(next);
      return next;
    });
  }, []);

  const recordAnalyzeGenerate: DashboardContextValue['recordAnalyzeGenerate'] = useCallback((game) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = recGen(prev, game);
      void saveDashboardState(next);
      return next;
    });
  }, []);

  const recordGamePicked: DashboardContextValue['recordGamePicked'] = useCallback((game) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = recGame(prev, game);
      void saveDashboardState(next);
      return next;
    });
  }, []);

  const recordResultCheck: DashboardContextValue['recordResultCheck'] = useCallback((gameNameHint) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = recCheck(prev, gameNameHint);
      void saveDashboardState(next);
      return next;
    });
  }, []);

  const value = useMemo((): DashboardContextValue => {
    return {
      state,
      ready,
      refresh,
      recordTabOpen,
      recordAnalyzeGenerate,
      recordGamePicked,
      recordResultCheck,
    };
  }, [state, ready, refresh, recordTabOpen, recordAnalyzeGenerate, recordGamePicked, recordResultCheck]);

  return <DashboardStateContext.Provider value={value}>{children}</DashboardStateContext.Provider>;
}

export function useDashboardState() {
  const c = useContext(DashboardStateContext);
  if (!c) {
    throw new Error('useDashboardState requires DashboardStateProvider');
  }
  return c;
}

export function useDashboardStateOptional() {
  return useContext(DashboardStateContext);
}
