import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameType } from '@florida-lotto/shared';
import { FLORIDA_GAMES, GAME_TYPES } from '@florida-lotto/shared';

const KEY = 'fl_dash_v1';
const MAX_EVENTS = 40;
const MAX_SESSIONS = 30;
const DASHBOARD_VERSION = 1;

export type DashboardEventSource = 'app_session' | 'analysis' | 'import' | 'result_check' | 'track';

export type DashboardEvent = {
  id: string;
  at: string; // ISO
  source: DashboardEventSource;
  gameType: GameType | null;
  label: string; // what happened (honest, short)
  detail?: string; // e.g. game name, optional
};

type StoredSession = { at: string };

export type DashboardState = {
  v: number;
  /** All-time: user opened the app to this screen (bounded list of timestamps) */
  appSessions: StoredSession[];
  /** All-time: navigated to Analyze (real interaction) */
  analysisOpens: number;
  /** All-time: navigated to Generate */
  generateOpens: number;
  /** All-time: navigated to Track */
  trackOpens: number;
  /** All-time: navigated to Models */
  modelsOpens: number;
  /** All-time: requested draw / results related views (e.g. check results) */
  resultCheckCount: number;
  /** All-time: import intent from dashboard (if wired later) */
  importCount: number;
  /** When user last opened Analyze from Home */
  lastAnalysisAt: string | null;
  lastGenerateAt: string | null;
  lastTrackAt: string | null;
  lastResultCheckAt: string | null;
  events: DashboardEvent[];
  /** Generations in this app install (user tapped Generate in Analyze) */
  analyzeGenerateCount: number;
  lastAnalyzeGenerateAt: string | null;
  /** When user last picked a game in Analyze (real interaction) */
  lastGamePicked: GameType | null;
  lastGamePickedAt: string | null;
  /** Count of times a game was selected in Analyze (this install) */
  gamePickedCounts: Partial<Record<GameType, number>>;
};

export const createEmptyDashboardState = (): DashboardState => ({
  v: DASHBOARD_VERSION,
  appSessions: [],
  analysisOpens: 0,
  generateOpens: 0,
  trackOpens: 0,
  modelsOpens: 0,
  resultCheckCount: 0,
  importCount: 0,
  lastAnalysisAt: null,
  lastGenerateAt: null,
  lastTrackAt: null,
  lastResultCheckAt: null,
  events: [],
  analyzeGenerateCount: 0,
  lastAnalyzeGenerateAt: null,
  lastGamePicked: null,
  lastGamePickedAt: null,
  gamePickedCounts: {},
});

function clampSessions(sessions: StoredSession[]): StoredSession[] {
  return sessions.slice(-MAX_SESSIONS);
}

function clampEvents(events: DashboardEvent[]): DashboardEvent[] {
  return events.slice(-MAX_EVENTS);
}

export function gameLabel(gameType: GameType | null | undefined): string {
  if (!gameType || !FLORIDA_GAMES[gameType as GameType]) {
    return 'All games';
  }
  return FLORIDA_GAMES[gameType as GameType].name;
}

function loadRaw(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function loadDashboardState(): Promise<DashboardState> {
  const raw = await loadRaw();
  if (!raw) return createEmptyDashboardState();
  try {
    const p = JSON.parse(raw) as Partial<DashboardState>;
    if (p.v !== DASHBOARD_VERSION) return createEmptyDashboardState();
    return {
      ...createEmptyDashboardState(),
      ...p,
      v: DASHBOARD_VERSION,
      appSessions: Array.isArray(p.appSessions) ? p.appSessions : [],
      events: Array.isArray(p.events) ? p.events : [],
      gamePickedCounts:
        p.gamePickedCounts && typeof p.gamePickedCounts === 'object' ? p.gamePickedCounts : {},
    } as DashboardState;
  } catch {
    return createEmptyDashboardState();
  }
}

export async function saveDashboardState(s: DashboardState): Promise<void> {
  s.appSessions = clampSessions(s.appSessions);
  s.events = clampEvents(s.events);
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function appendEvent(
  s: DashboardState,
  e: Omit<DashboardEvent, 'id' | 'at'>,
): DashboardState {
  const ev: DashboardEvent = { ...e, id: newId(), at: new Date().toISOString() };
  return { ...s, events: clampEvents([...s.events, ev]) };
}

/** Record a single "opened app" session when Home mounts (once per process/cold start friendly via caller). */
export function recordAppSession(s: DashboardState, at = new Date().toISOString()): DashboardState {
  return {
    ...s,
    appSessions: clampSessions([...s.appSessions, { at }]),
  };
}

export function recordTabOpen(
  s: DashboardState,
  tab: 'home' | 'analyze' | 'generate' | 'track' | 'models',
  gameType: GameType | null,
): DashboardState {
  const now = new Date().toISOString();
  if (tab === 'home') {
    return s;
  }
  let next = { ...s };
  if (tab === 'analyze') {
    next = {
      ...next,
      analysisOpens: next.analysisOpens + 1,
      lastAnalysisAt: now,
    };
  } else if (tab === 'generate') {
    next = { ...next, generateOpens: next.generateOpens + 1, lastGenerateAt: now };
  } else if (tab === 'track') {
    next = { ...next, trackOpens: next.trackOpens + 1, lastTrackAt: now };
  } else {
    next = { ...next, modelsOpens: next.modelsOpens + 1 };
  }
  return next;
}

export function recordAnalyzeGenerate(s: DashboardState, gameType: GameType | null): DashboardState {
  const now = new Date().toISOString();
  let next: DashboardState = {
    ...s,
    analyzeGenerateCount: s.analyzeGenerateCount + 1,
    lastAnalyzeGenerateAt: now,
  };
  next = appendEvent(next, {
    source: 'analysis',
    gameType,
    label: 'Ran model predictions',
    detail: gameType ? gameLabel(gameType) : undefined,
  });
  return next;
}

export function recordGamePicked(s: DashboardState, gameType: GameType): DashboardState {
  const now = new Date().toISOString();
  const n = (s.gamePickedCounts[gameType] ?? 0) + 1;
  return {
    ...s,
    lastGamePicked: gameType,
    lastGamePickedAt: now,
    gamePickedCounts: { ...s.gamePickedCounts, [gameType]: n },
  };
}

export function recordResultCheck(s: DashboardState, gameNameHint?: string): DashboardState {
  const now = new Date().toISOString();
  let next: DashboardState = {
    ...s,
    resultCheckCount: s.resultCheckCount + 1,
    lastResultCheckAt: now,
  };
  next = appendEvent(next, {
    source: 'result_check',
    gameType: null,
    label: 'Checked results',
    detail: gameNameHint,
  });
  return next;
}

export function getRecentEventCount(
  s: DashboardState,
  withinMs: number,
  since = Date.now(),
): number {
  const min = since - withinMs;
  return s.events.filter((e) => {
    const t = new Date(e.at).getTime();
    return t >= min;
  }).length;
}

export function isGameType(x: string): x is GameType {
  return (GAME_TYPES as readonly string[]).includes(x);
}
