import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameType } from '@florida-lotto/shared';

const STORAGE_KEY = 'florida-lotto-predictor.saved-picks.v1';
const STORAGE_VERSION = 1;

export type SavedPickStatus = 'pending' | 'graded' | 'reviewed' | 'won' | 'lost';
export type SavedPickSourceType = 'generated' | 'manual' | 'importedPdf' | 'uploadedImage';

export type SavedPickGradeFields = {
  mainMatchCount: number;
  specialMatchCount: number;
  matchedMainNumbers: number[];
  matchedSpecialNumbers: number[];
  gradeSummary: string | null;
  prizeTierLabel: string | null;
  gradedAt: string | null;
  lastCheckedAt: string | null;
  drawResultId: number | null;
  drawResultDate: number | null;
  drawResultLabel: string | null;
  resultSource: string | null;
};

export type SavedPick = {
  id: string;
  savedAt: string;
  gameType: GameType;
  gameName: string;
  modelName: string;
  mainNumbers: number[];
  specialNumbers: number[];
  confidenceScore: number;
  status: SavedPickStatus;
  notes: string;
  sourceContext: string;
  sourceType: SavedPickSourceType;
  sourceLabel: string | null;
  importedAt: string | null;
  originalFileName: string | null;
  drawDate: string | null;
  drawLabel: string | null;
} & SavedPickGradeFields;

type SavedPickSourceFields = Pick<SavedPick, 'sourceType' | 'sourceLabel' | 'importedAt' | 'originalFileName'>;

export type SavePickInput = Omit<SavedPick, 'id' | 'savedAt' | 'status' | keyof SavedPickGradeFields | keyof SavedPickSourceFields> & {
  id?: string;
  savedAt?: string;
  status?: SavedPickStatus;
} & Partial<SavedPickGradeFields> & Partial<SavedPickSourceFields>;

export type SavedPickGradePatch = Partial<SavedPickGradeFields> & {
  status?: SavedPickStatus;
};

type StoredLedger = {
  version: number;
  picks: SavedPick[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSourceType(value: unknown): value is SavedPickSourceType {
  return value === 'generated'
    || value === 'manual'
    || value === 'importedPdf'
    || value === 'uploadedImage';
}

function isStatus(value: unknown): value is SavedPickStatus {
  return value === 'pending'
    || value === 'graded'
    || value === 'reviewed'
    || value === 'won'
    || value === 'lost';
}

function normalizeNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => typeof item === 'number' ? item : Number(item))
    .filter(item => Number.isFinite(item));
}

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeGradeFields(value: Partial<SavedPickGradeFields> | Record<string, unknown>): SavedPickGradeFields {
  return {
    mainMatchCount: nullableNumber(value.mainMatchCount) ?? 0,
    specialMatchCount: nullableNumber(value.specialMatchCount) ?? 0,
    matchedMainNumbers: normalizeNumbers(value.matchedMainNumbers),
    matchedSpecialNumbers: normalizeNumbers(value.matchedSpecialNumbers),
    gradeSummary: nullableString(value.gradeSummary),
    prizeTierLabel: nullableString(value.prizeTierLabel),
    gradedAt: nullableString(value.gradedAt),
    lastCheckedAt: nullableString(value.lastCheckedAt),
    drawResultId: nullableNumber(value.drawResultId),
    drawResultDate: nullableNumber(value.drawResultDate),
    drawResultLabel: nullableString(value.drawResultLabel),
    resultSource: nullableString(value.resultSource),
  };
}

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

export function createSavedPickId(input: Omit<SavePickInput, 'id' | 'savedAt' | 'status'>) {
  const keyModel = input.sourceType && input.sourceType !== 'generated' ? 'ticket-entry' : input.modelName;

  return hashString([
    input.gameType,
    input.gameName,
    keyModel,
    input.mainNumbers.join('-'),
    input.specialNumbers.join('-'),
    input.drawDate ?? '',
    input.drawLabel ?? '',
  ].join('|'));
}

export function createPickKey(pick: Pick<SavedPick, 'gameType' | 'modelName' | 'mainNumbers' | 'specialNumbers' | 'drawDate' | 'drawLabel'> & Partial<Pick<SavedPick, 'sourceType'>>) {
  const keyModel = pick.sourceType && pick.sourceType !== 'generated' ? 'ticket-entry' : pick.modelName;

  return [
    pick.gameType,
    keyModel,
    pick.mainNumbers.join('-'),
    pick.specialNumbers.join('-'),
    pick.drawDate ?? '',
    pick.drawLabel ?? '',
  ].join('|');
}

export function normalizeSavedPick(value: unknown): SavedPick | null {
  if (!isObject(value)) {
    return null;
  }

  const gameType = stringOrFallback(value.gameType, '');
  const gameName = stringOrFallback(value.gameName, '');
  const modelName = stringOrFallback(value.modelName, '');
  const mainNumbers = normalizeNumbers(value.mainNumbers);
  const specialNumbers = normalizeNumbers(value.specialNumbers);
  const confidenceScore = typeof value.confidenceScore === 'number'
    ? value.confidenceScore
    : Number(value.confidenceScore);

  if (!gameType || !gameName || !modelName || mainNumbers.length === 0 || !Number.isFinite(confidenceScore)) {
    return null;
  }

  const base = {
    gameType: gameType as GameType,
    gameName,
    modelName,
    mainNumbers,
    specialNumbers,
    confidenceScore,
    notes: typeof value.notes === 'string' ? value.notes : '',
    sourceContext: stringOrFallback(value.sourceContext, 'local'),
    sourceType: isSourceType(value.sourceType) ? value.sourceType : 'generated',
    sourceLabel: nullableString(value.sourceLabel),
    importedAt: nullableString(value.importedAt),
    originalFileName: nullableString(value.originalFileName),
    drawDate: nullableString(value.drawDate),
    drawLabel: nullableString(value.drawLabel),
  };

  return {
    ...base,
    ...normalizeGradeFields(value),
    id: stringOrFallback(value.id, createSavedPickId(base)),
    savedAt: stringOrFallback(value.savedAt, new Date().toISOString()),
    status: isStatus(value.status) ? value.status : 'pending',
  };
}

export function createSavedPick(input: SavePickInput): SavedPick {
  const base = {
    gameType: input.gameType,
    gameName: input.gameName,
    modelName: input.modelName,
    mainNumbers: input.mainNumbers,
    specialNumbers: input.specialNumbers,
    confidenceScore: input.confidenceScore,
    notes: input.notes,
    sourceContext: input.sourceContext,
    sourceType: input.sourceType ?? 'generated',
    sourceLabel: input.sourceLabel ?? null,
    importedAt: input.importedAt ?? null,
    originalFileName: input.originalFileName ?? null,
    drawDate: input.drawDate,
    drawLabel: input.drawLabel,
  };

  return {
    ...base,
    ...normalizeGradeFields(input),
    id: input.id ?? createSavedPickId(base),
    savedAt: input.savedAt ?? new Date().toISOString(),
    status: input.status ?? 'pending',
  };
}

export async function loadSavedPicks() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  const picks = isObject(parsed) && Array.isArray(parsed.picks)
    ? parsed.picks
    : Array.isArray(parsed)
      ? parsed
      : [];

  return picks
    .map(normalizeSavedPick)
    .filter((pick): pick is SavedPick => Boolean(pick))
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

export async function persistSavedPicks(picks: SavedPick[]) {
  const payload: StoredLedger = {
    version: STORAGE_VERSION,
    picks,
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
