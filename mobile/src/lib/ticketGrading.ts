import { FLORIDA_GAMES, type GameType } from '@florida-lotto/shared';
import type { SavedPick, SavedPickGradePatch, SavedPickStatus } from './savedPicksStorage';

export type DrawResultLike = {
  id?: number | string | null;
  gameType?: string | null;
  drawDate?: number | string | Date | null;
  mainNumbers?: unknown;
  specialNumbers?: unknown;
  drawTime?: string | null;
  source?: string | null;
};

export type NormalizedDrawResult = {
  id: number | null;
  gameType: GameType;
  drawDateMs: number;
  mainNumbers: number[];
  specialNumbers: number[];
  drawTime: string | null;
  source: string | null;
  label: string;
};

export type GradeOutcome = {
  id: string;
  drawFound: boolean;
  grade: SavedPickGradePatch;
};

export type LedgerStats = {
  total: number;
  pending: number;
  checked: number;
  graded: number;
  reviewed: number;
  won: number;
  lost: number;
  generated: number;
  imported: number;
  byGame: Array<{ key: string; label: string; count: number; pending: number; checked: number; won: number; lost: number }>;
  byModel: Array<{ key: string; label: string; count: number; checked: number; won: number; lost: number }>;
  bySource: Array<{ key: string; label: string; count: number; checked: number }>;
  matchDistribution: Array<{ label: string; count: number }>;
  prizeTiers: Array<{ label: string; count: number }>;
};

function normalizeNumbers(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === 'number' ? item : Number(item))
      .filter(item => Number.isFinite(item));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      return normalizeNumbers(JSON.parse(trimmed));
    } catch {
      return trimmed
        .split(/[^0-9]+/)
        .map(item => Number(item))
        .filter(item => Number.isFinite(item));
    }
  }

  return [];
}

function parseDateMs(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toDateKey(ms: number) {
  const date = new Date(ms);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDrawLabel(drawDateMs: number, drawTime?: string | null) {
  const date = new Date(drawDateMs);
  const dateLabel = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return drawTime ? `${dateLabel} ${drawTime}` : dateLabel;
}

function normalizeDrawResult(value: DrawResultLike, gameType: GameType): NormalizedDrawResult | null {
  const drawDateMs = parseDateMs(value.drawDate);
  const mainNumbers = normalizeNumbers(value.mainNumbers);
  const specialNumbers = normalizeNumbers(value.specialNumbers);
  const id = typeof value.id === 'number'
    ? value.id
    : typeof value.id === 'string' && Number.isFinite(Number(value.id))
      ? Number(value.id)
      : null;

  if (!drawDateMs || mainNumbers.length === 0) {
    return null;
  }

  return {
    id,
    gameType,
    drawDateMs,
    mainNumbers,
    specialNumbers,
    drawTime: typeof value.drawTime === 'string' && value.drawTime.trim() ? value.drawTime.trim() : null,
    source: typeof value.source === 'string' && value.source.trim() ? value.source.trim() : null,
    label: formatDrawLabel(drawDateMs, value.drawTime),
  };
}

export function normalizeDrawResults(draws: DrawResultLike[], gameType: GameType) {
  return draws
    .map(draw => normalizeDrawResult(draw, gameType))
    .filter((draw): draw is NormalizedDrawResult => Boolean(draw))
    .sort((a, b) => b.drawDateMs - a.drawDateMs);
}

function findDrawForPick(pick: SavedPick, draws: NormalizedDrawResult[]) {
  if (draws.length === 0) {
    return null;
  }

  const targetMs = parseDateMs(pick.drawDate);

  if (targetMs) {
    const targetKey = toDateKey(targetMs);
    const sameDate = draws.filter(draw => toDateKey(draw.drawDateMs) === targetKey);

    if (sameDate.length > 0) {
      return sameDate
        .slice()
        .sort((a, b) => Math.abs(a.drawDateMs - targetMs) - Math.abs(b.drawDateMs - targetMs))[0];
    }

    return draws
      .filter(draw => Math.abs(draw.drawDateMs - targetMs) <= 36 * 60 * 60 * 1000)
      .sort((a, b) => Math.abs(a.drawDateMs - targetMs) - Math.abs(b.drawDateMs - targetMs))[0] ?? null;
  }

  const savedAtMs = parseDateMs(pick.savedAt);

  if (!savedAtMs) {
    return null;
  }

  return draws
    .filter(draw => draw.drawDateMs >= savedAtMs)
    .sort((a, b) => a.drawDateMs - b.drawDateMs)[0] ?? null;
}

function compareMainNumbers(pick: SavedPick, draw: NormalizedDrawResult) {
  const cfg = FLORIDA_GAMES[pick.gameType];

  if (cfg.isDigitGame) {
    return pick.mainNumbers.filter((number, index) => draw.mainNumbers[index] === number);
  }

  const drawNumbers = new Set(draw.mainNumbers);
  return pick.mainNumbers.filter(number => drawNumbers.has(number));
}

function compareSpecialNumbers(pick: SavedPick, draw: NormalizedDrawResult) {
  if (pick.specialNumbers.length === 0 || draw.specialNumbers.length === 0) {
    return [];
  }

  const drawNumbers = new Set(draw.specialNumbers);
  return pick.specialNumbers.filter(number => drawNumbers.has(number));
}

function deriveStatus(pick: SavedPick, matchedMainNumbers: number[], matchedSpecialNumbers: number[]): SavedPickStatus {
  const exactMain = matchedMainNumbers.length === pick.mainNumbers.length;
  const exactSpecial = pick.specialNumbers.length === 0
    ? true
    : matchedSpecialNumbers.length === pick.specialNumbers.length;
  const noMatches = matchedMainNumbers.length === 0 && matchedSpecialNumbers.length === 0;

  if (exactMain && exactSpecial) {
    return 'won';
  }

  if (noMatches) {
    return 'lost';
  }

  return 'graded';
}

function buildGradeSummary(
  pick: SavedPick,
  draw: NormalizedDrawResult,
  matchedMainNumbers: number[],
  matchedSpecialNumbers: number[],
) {
  const cfg = FLORIDA_GAMES[pick.gameType];
  const mainLabel = cfg.isDigitGame ? 'ordered digit' : 'main';
  const pieces = [`${matchedMainNumbers.length}/${pick.mainNumbers.length} ${mainLabel}`];

  if (pick.specialNumbers.length > 0) {
    pieces.push(`${matchedSpecialNumbers.length}/${pick.specialNumbers.length} special`);
  }

  return `${pieces.join(', ')} vs ${draw.label}`;
}

function specialBallLabel(gameType: GameType) {
  switch (gameType) {
    case 'powerball':
      return 'Powerball';
    case 'mega_millions':
      return 'Mega Ball';
    case 'cash4life':
      return 'Cash Ball';
    default:
      return 'special';
  }
}

function buildPrizeTierLabel(
  pick: SavedPick,
  matchedMainNumbers: number[],
  matchedSpecialNumbers: number[],
) {
  const cfg = FLORIDA_GAMES[pick.gameType];
  const mainMatches = matchedMainNumbers.length;
  const specialMatches = matchedSpecialNumbers.length;

  if (cfg.isDigitGame) {
    if (mainMatches === pick.mainNumbers.length) {
      return 'Straight match';
    }

    return `${mainMatches}/${pick.mainNumbers.length} ordered digits`;
  }

  if (pick.specialNumbers.length > 0) {
    const specialLabel = specialBallLabel(pick.gameType);
    return specialMatches > 0
      ? `${mainMatches} + ${specialLabel}`
      : `${mainMatches} main`;
  }

  if (mainMatches === pick.mainNumbers.length) {
    return 'Full match';
  }

  return `${mainMatches}/${pick.mainNumbers.length} main`;
}

export function gradeSavedPick(
  pick: SavedPick,
  draws: NormalizedDrawResult[],
  checkedAt = new Date().toISOString(),
): GradeOutcome {
  const draw = findDrawForPick(pick, draws);

  if (!draw) {
    return {
      id: pick.id,
      drawFound: false,
      grade: {
        lastCheckedAt: checkedAt,
        gradeSummary: pick.gradeSummary ?? 'No matching draw result is available yet.',
      },
    };
  }

  const matchedMainNumbers = compareMainNumbers(pick, draw);
  const matchedSpecialNumbers = compareSpecialNumbers(pick, draw);
  const status = deriveStatus(pick, matchedMainNumbers, matchedSpecialNumbers);

  return {
    id: pick.id,
    drawFound: true,
    grade: {
      status,
      mainMatchCount: matchedMainNumbers.length,
      specialMatchCount: matchedSpecialNumbers.length,
      matchedMainNumbers,
      matchedSpecialNumbers,
      gradeSummary: buildGradeSummary(pick, draw, matchedMainNumbers, matchedSpecialNumbers),
      prizeTierLabel: buildPrizeTierLabel(pick, matchedMainNumbers, matchedSpecialNumbers),
      gradedAt: checkedAt,
      lastCheckedAt: checkedAt,
      drawResultId: draw.id,
      drawResultDate: draw.drawDateMs,
      drawResultLabel: draw.label,
      resultSource: draw.source,
    },
  };
}

function createCounter<T extends { key: string; count: number }>(items: T[], key: string, create: () => T) {
  const existing = items.find(item => item.key === key);

  if (existing) {
    existing.count += 1;
    return existing;
  }

  const next = create();
  items.push(next);
  return next;
}

function matchDistributionKey(pick: SavedPick) {
  if (!pick.gradedAt) {
    return null;
  }

  return pick.specialNumbers.length > 0
    ? `${pick.mainMatchCount}+${pick.specialMatchCount} special`
    : `${pick.mainMatchCount} match${pick.mainMatchCount === 1 ? '' : 'es'}`;
}

export function deriveLedgerStats(picks: SavedPick[]): LedgerStats {
  const byGame: LedgerStats['byGame'] = [];
  const byModel: LedgerStats['byModel'] = [];
  const bySource: LedgerStats['bySource'] = [];
  const matchDistribution = new Map<string, number>();
  const prizeTiers = new Map<string, number>();

  picks.forEach(pick => {
    const isChecked = Boolean(pick.gradedAt || pick.lastCheckedAt);
    const gameCount = createCounter(byGame, pick.gameType, () => ({
      key: pick.gameType,
      label: pick.gameName,
      count: 0,
      pending: 0,
      checked: 0,
      won: 0,
      lost: 0,
    }));
    const sourceCount = createCounter(bySource, pick.sourceType, () => ({
      key: pick.sourceType,
      label: sourceTypeLabel(pick.sourceType),
      count: 0,
      checked: 0,
    }));
    const modelCount = createCounter(byModel, pick.modelName, () => ({
      key: pick.modelName,
      label: pick.modelName,
      count: 0,
      checked: 0,
      won: 0,
      lost: 0,
    }));

    if (pick.status === 'pending') {
      gameCount.pending += 1;
    }

    if (isChecked) {
      gameCount.checked += 1;
      modelCount.checked += 1;
      sourceCount.checked += 1;
    }

    if (pick.status === 'won') {
      gameCount.won += 1;
      modelCount.won += 1;
    }

    if (pick.status === 'lost') {
      gameCount.lost += 1;
      modelCount.lost += 1;
    }

    const distributionKey = matchDistributionKey(pick);

    if (distributionKey) {
      matchDistribution.set(distributionKey, (matchDistribution.get(distributionKey) ?? 0) + 1);
    }

    if (pick.prizeTierLabel) {
      prizeTiers.set(pick.prizeTierLabel, (prizeTiers.get(pick.prizeTierLabel) ?? 0) + 1);
    }
  });

  const statusCount = (status: SavedPickStatus) => picks.filter(pick => pick.status === status).length;
  const checked = picks.filter(pick => pick.gradedAt || pick.lastCheckedAt).length;

  return {
    total: picks.length,
    pending: statusCount('pending'),
    checked,
    graded: statusCount('graded'),
    reviewed: statusCount('reviewed'),
    won: statusCount('won'),
    lost: statusCount('lost'),
    generated: picks.filter(pick => pick.sourceType === 'generated').length,
    imported: picks.filter(pick => pick.sourceType !== 'generated').length,
    byGame: byGame.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byModel: byModel.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    bySource: bySource.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    matchDistribution: Array.from(matchDistribution.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    prizeTiers: Array.from(prizeTiers.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

export function sourceTypeLabel(sourceType: SavedPick['sourceType']) {
  switch (sourceType) {
    case 'manual':
      return 'Manual entry';
    case 'importedPdf':
      return 'PDF import';
    case 'uploadedImage':
      return 'Image upload';
    default:
      return 'Generated';
  }
}
