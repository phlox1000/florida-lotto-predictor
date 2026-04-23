import { FLORIDA_GAMES, type GameType } from '@florida-lotto/shared';
import type { SavePickInput, SavedPickSourceType } from './SavedPicksProvider';

export type ManualTicketDraft = {
  gameType: GameType;
  mainNumbersText: string;
  specialNumbersText: string;
  drawDate: string;
  drawTime: 'midday' | 'evening';
  notes: string;
  sourceType?: SavedPickSourceType;
  sourceLabel?: string;
  originalFileName?: string | null;
};

export type TicketImportBuildResult = {
  input: SavePickInput | null;
  errors: string[];
};

function splitNumberText(value: string, expectedCount: number, isDigitGame: boolean) {
  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  if (isDigitGame && /^\d+$/.test(trimmed) && trimmed.length === expectedCount) {
    return trimmed.split('').map(item => Number(item));
  }

  return trimmed
    .split(/[^0-9]+/)
    .map(item => Number(item))
    .filter(item => Number.isFinite(item));
}

function validateNumbers(
  label: string,
  numbers: number[],
  expectedCount: number,
  min: number,
  max: number,
  allowRepeats: boolean,
) {
  const errors: string[] = [];

  if (numbers.length !== expectedCount) {
    errors.push(`${label} requires ${expectedCount} number${expectedCount === 1 ? '' : 's'}.`);
  }

  if (numbers.some(number => number < min || number > max)) {
    errors.push(`${label} must stay in range ${min}-${max}.`);
  }

  if (!allowRepeats && new Set(numbers).size !== numbers.length) {
    errors.push(`${label} cannot repeat numbers for this game.`);
  }

  return errors;
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = Date.parse(`${trimmed}T00:00:00`);
  return Number.isFinite(parsed) ? trimmed : null;
}

export function buildManualTicketInput(draft: ManualTicketDraft): TicketImportBuildResult {
  const cfg = FLORIDA_GAMES[draft.gameType];
  const errors: string[] = [];

  if (!cfg) {
    return { input: null, errors: ['Select a supported Florida game.'] };
  }

  const mainNumbers = splitNumberText(draft.mainNumbersText, cfg.mainCount, cfg.isDigitGame);
  const specialNumbers = splitNumberText(draft.specialNumbersText, cfg.specialCount, false);
  const normalizedDate = normalizeDateInput(draft.drawDate);

  errors.push(...validateNumbers(
    'Main numbers',
    mainNumbers,
    cfg.mainCount,
    cfg.isDigitGame ? 0 : 1,
    cfg.isDigitGame ? 9 : cfg.mainMax,
    cfg.isDigitGame,
  ));

  if (cfg.specialCount > 0) {
    errors.push(...validateNumbers(
      'Special numbers',
      specialNumbers,
      cfg.specialCount,
      1,
      cfg.specialMax,
      false,
    ));
  } else if (specialNumbers.length > 0) {
    errors.push(`${cfg.name} does not use a special number.`);
  }

  if (!normalizedDate) {
    errors.push('Draw date must use YYYY-MM-DD format.');
  }

  if (errors.length > 0 || !normalizedDate) {
    return { input: null, errors };
  }

  const sourceType = draft.sourceType ?? 'manual';
  const sourceLabel = draft.sourceLabel ?? 'Manual entry';

  return {
    input: {
      gameType: draft.gameType,
      gameName: cfg.name,
      modelName: sourceLabel,
      mainNumbers,
      specialNumbers,
      confidenceScore: 0,
      notes: draft.notes.trim(),
      sourceContext: sourceLabel,
      sourceType,
      sourceLabel,
      importedAt: new Date().toISOString(),
      originalFileName: draft.originalFileName ?? null,
      drawDate: normalizedDate,
      drawLabel: `${cfg.name}: ${normalizedDate} ${draft.drawTime}`,
    },
    errors: [],
  };
}
