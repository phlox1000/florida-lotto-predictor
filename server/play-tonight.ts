import {
  FLORIDA_GAMES,
  GAME_TYPES,
  formatTimeUntil,
  getNextDrawDate,
  type GameType,
  type PredictionResult,
} from "@shared/lottery";
import {
  getDrawResultCount,
  getDrawResults,
  getModelPerformanceStats,
  getModelWeights,
  getROIByGame,
} from "./db";
import { applySumRangeFilter, runAllModels } from "./predictions";

type HistoryDraw = {
  mainNumbers: number[];
  specialNumbers: number[];
  drawDate: number;
};

type ModelPerfSnapshot = {
  avgMainHits: number;
  totalPredictions: number;
};

type CandidateScore = {
  modelName: string;
  mainNumbers: number[];
  specialNumbers: number[];
  confidenceScore: number;
  modelUsefulness: number;
  consensusSupport: number;
  patternSupport: number;
  finalScore: number;
  reasons: string[];
};

type GameChoice = {
  gameType: GameType;
  gameName: string;
  score: number;
  nextDrawIso: string | null;
  nextDrawCountdown: string;
  reason: string;
};

function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function canonicalCandidateKey(mainNumbers: number[], specialNumbers: number[]): string {
  const main = [...mainNumbers].sort((a, b) => a - b).join(",");
  const special = [...specialNumbers].sort((a, b) => a - b).join(",");
  return `${main}|${special}`;
}

function normalizeHistory(rows: Awaited<ReturnType<typeof getDrawResults>>): HistoryDraw[] {
  return rows.map(row => ({
    mainNumbers: Array.isArray(row.mainNumbers)
      ? (row.mainNumbers as number[]).map(Number).filter(Number.isFinite)
      : [],
    specialNumbers: Array.isArray(row.specialNumbers)
      ? (row.specialNumbers as number[]).map(Number).filter(Number.isFinite)
      : [],
    drawDate: Number(row.drawDate) || 0,
  }));
}

function buildModelPerfMap(
  stats: Awaited<ReturnType<typeof getModelPerformanceStats>>
): Map<string, ModelPerfSnapshot> {
  const map = new Map<string, ModelPerfSnapshot>();
  for (const stat of stats) {
    map.set(stat.modelName, {
      avgMainHits: Number(stat.avgMainHits) || 0,
      totalPredictions: Number(stat.totalPredictions) || 0,
    });
  }
  return map;
}

function scoreModelUsefulness(params: {
  prediction: PredictionResult;
  cfgMainCount: number;
  modelWeights: Record<string, number>;
  modelPerf: Map<string, ModelPerfSnapshot>;
}): number {
  const perf = params.modelPerf.get(params.prediction.modelName);
  const avgHitsNorm = clamp((perf?.avgMainHits || 0) / Math.max(1, params.cfgMainCount));
  const sampleNorm = clamp((perf?.totalPredictions || 0) / 25);
  const weightNorm = clamp(params.modelWeights[params.prediction.modelName] ?? 0.45);
  const confidenceNorm = clamp(params.prediction.confidenceScore);
  return clamp(
    0.4 * weightNorm + 0.25 * avgHitsNorm + 0.15 * sampleNorm + 0.2 * confidenceNorm
  );
}

function buildNumberConsensusMap(
  predictions: PredictionResult[],
  usefulnessMap: Map<string, number>
): Map<number, number> {
  const votes = new Map<number, number>();
  for (const prediction of predictions) {
    const usefulness = usefulnessMap.get(prediction.modelName) ?? 0.45;
    const weight = usefulness * clamp(prediction.confidenceScore, 0.05, 1);
    for (const number of prediction.mainNumbers) {
      votes.set(number, (votes.get(number) || 0) + weight);
    }
  }
  return votes;
}

function buildPatternProfile(cfgMainMax: number, history: HistoryDraw[]) {
  if (history.length < 20) return null;
  const sums = history
    .map(draw => draw.mainNumbers.reduce((sum, num) => sum + num, 0))
    .sort((a, b) => a - b);
  const p10 = sums[Math.floor(sums.length * 0.1)] ?? sums[0] ?? 0;
  const p90 = sums[Math.floor(sums.length * 0.9)] ?? sums[sums.length - 1] ?? 0;
  const midpoint = Math.ceil(cfgMainMax / 2);
  const lastDraw = history[0]?.mainNumbers ?? [];
  return { p10, p90, midpoint, lastDraw };
}

function evaluatePatternSupport(
  mainNumbers: number[],
  mainCount: number,
  patternProfile: ReturnType<typeof buildPatternProfile>
): { score: number; notes: string[] } {
  if (!patternProfile) {
    return {
      score: 0.5,
      notes: ["Limited draw history; pattern support is neutral."],
    };
  }

  const notes: string[] = [];
  const sum = mainNumbers.reduce((acc, n) => acc + n, 0);
  const rangeWidth = Math.max(8, patternProfile.p90 - patternProfile.p10);
  const sumDistance =
    sum < patternProfile.p10
      ? patternProfile.p10 - sum
      : sum > patternProfile.p90
        ? sum - patternProfile.p90
        : 0;
  const sumSupport = clamp(1 - sumDistance / rangeWidth);

  const idealOdd = Math.round(mainCount / 2);
  const oddCount = mainNumbers.filter(n => n % 2 !== 0).length;
  const oddEvenSupport = clamp(1 - Math.abs(oddCount - idealOdd) / Math.max(1, Math.ceil(mainCount / 2)));

  const highCount = mainNumbers.filter(n => n > patternProfile.midpoint).length;
  const idealHigh = Math.round(mainCount / 2);
  const highLowSupport = clamp(1 - Math.abs(highCount - idealHigh) / Math.max(1, Math.ceil(mainCount / 2)));

  const overlapWithLatest =
    patternProfile.lastDraw.length > 0
      ? mainNumbers.filter(n => patternProfile.lastDraw.includes(n)).length / mainNumbers.length
      : 0;
  const repeatPenalty = 1 - 0.2 * overlapWithLatest;

  if (sumDistance === 0) notes.push("Sum is inside historical range.");
  if (oddEvenSupport >= 0.75) notes.push("Odd/even split is balanced.");
  if (highLowSupport >= 0.75) notes.push("High/low split is balanced.");
  if (overlapWithLatest > 0.5) notes.push("Heavy overlap with latest draw lowered pattern fit.");

  const score = clamp(
    (0.5 * sumSupport + 0.25 * oddEvenSupport + 0.25 * highLowSupport) * repeatPenalty
  );

  return { score, notes };
}

function toConfidenceLabel(score: number): "high" | "medium" | "cautious" {
  if (score >= 0.72) return "high";
  if (score >= 0.56) return "medium";
  return "cautious";
}

async function chooseGameForTonight(params: {
  preferredGameType?: GameType;
  roiByGameMap: Map<string, { totalSpent: number; totalWon: number }>;
}): Promise<{ selected: GameChoice; alternatives: GameChoice[] }> {
  if (params.preferredGameType) {
    const cfg = FLORIDA_GAMES[params.preferredGameType];
    const nextDraw = getNextDrawDate(params.preferredGameType);
    return {
      selected: {
        gameType: params.preferredGameType,
        gameName: cfg.name,
        score: 1,
        nextDrawIso: nextDraw ? nextDraw.toISOString() : null,
        nextDrawCountdown: nextDraw ? formatTimeUntil(nextDraw) : "No scheduled draw",
        reason: "Using selected game.",
      },
      alternatives: [],
    };
  }

  const candidates: GameChoice[] = [];
  const activeGames = GAME_TYPES.filter(gameType => !FLORIDA_GAMES[gameType].schedule.ended);
  const counts = await Promise.all(
    activeGames.map(async gameType => ({
      gameType,
      drawCount: await getDrawResultCount(gameType),
      weights: await getModelWeights(gameType),
    }))
  );

  for (const row of counts) {
    const cfg = FLORIDA_GAMES[row.gameType];
    const nextDraw = getNextDrawDate(row.gameType);
    if (!nextDraw) continue;

    const avgWeightRaw = Object.values(row.weights);
    const avgWeight =
      avgWeightRaw.length > 0
        ? avgWeightRaw.reduce((sum, value) => sum + Number(value || 0), 0) / avgWeightRaw.length
        : 0.45;
    const historyReadiness = clamp(row.drawCount / 180);
    const hoursUntil = Math.max(0, (nextDraw.getTime() - Date.now()) / (1000 * 60 * 60));
    const drawSoonness = clamp(1 - Math.min(hoursUntil, 72) / 72);

    const roiStats = params.roiByGameMap.get(row.gameType);
    const roiPct =
      roiStats && roiStats.totalSpent > 0
        ? (roiStats.totalWon - roiStats.totalSpent) / roiStats.totalSpent
        : 0;
    const roiNorm = clamp((roiPct + 1) / 2);

    const score = clamp(
      0.4 * historyReadiness + 0.35 * avgWeight + 0.15 * drawSoonness + 0.1 * roiNorm
    );

    candidates.push({
      gameType: row.gameType,
      gameName: cfg.name,
      score,
      nextDrawIso: nextDraw.toISOString(),
      nextDrawCountdown: formatTimeUntil(nextDraw),
      reason: `Readiness ${Math.round(historyReadiness * 100)}%, model strength ${Math.round(
        avgWeight * 100
      )}%, timing ${Math.round(drawSoonness * 100)}%.`,
    });
  }

  const sorted = candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.gameType.localeCompare(b.gameType);
  });

  const selected = sorted[0] || {
    gameType: "fantasy_5",
    gameName: FLORIDA_GAMES.fantasy_5.name,
    score: 0.5,
    nextDrawIso: null,
    nextDrawCountdown: "Unknown",
    reason: "Fallback game due to unavailable scheduling data.",
  };

  return {
    selected,
    alternatives: sorted.slice(1, 4),
  };
}

export async function buildPlayTonightRecommendation(params: {
  userId: number | null;
  gameType?: GameType;
  backupCount?: number;
  sumRangeFilter?: boolean;
}) {
  const backupCount = Math.max(1, Math.min(5, params.backupCount ?? 3));
  const sumRangeFilter = params.sumRangeFilter !== false;

  const roiByGameMap = new Map<string, { totalSpent: number; totalWon: number }>();
  if (params.userId) {
    const roiByGame = await getROIByGame(params.userId);
    for (const row of roiByGame) {
      roiByGameMap.set(row.gameType, {
        totalSpent: Number(row.totalSpent) || 0,
        totalWon: Number(row.totalWon) || 0,
      });
    }
  }

  const gameSelection = await chooseGameForTonight({
    preferredGameType: params.gameType,
    roiByGameMap,
  });

  const selectedGameType = gameSelection.selected.gameType;
  const cfg = FLORIDA_GAMES[selectedGameType];
  const historyRows = await getDrawResults(selectedGameType, 200);
  const history = normalizeHistory(historyRows);
  const modelWeights = await getModelWeights(selectedGameType);
  const modelStats = await getModelPerformanceStats(selectedGameType);
  const modelPerfMap = buildModelPerfMap(modelStats);

  let predictions = runAllModels(
    cfg,
    history,
    Object.keys(modelWeights).length > 0 ? modelWeights : undefined
  );
  if (sumRangeFilter) {
    predictions = applySumRangeFilter(predictions, cfg, history);
  }

  const validPredictions = predictions.filter(
    prediction => prediction.mainNumbers.length > 0 && !prediction.metadata?.insufficient_data
  );

  const selectedRoi = roiByGameMap.get(selectedGameType);
  const personalScore =
    selectedRoi && selectedRoi.totalSpent > 0
      ? clamp(((selectedRoi.totalWon - selectedRoi.totalSpent) / selectedRoi.totalSpent + 1) / 2)
      : 0.5;

  if (validPredictions.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      gameType: selectedGameType,
      gameName: cfg.name,
      nextDrawIso: gameSelection.selected.nextDrawIso,
      nextDrawCountdown: gameSelection.selected.nextDrawCountdown,
      confidenceLabel: "cautious" as const,
      summary:
        "Not enough model-ready data to form a strong recommendation yet. Load more draw history and retry.",
      recommendation: null,
      backups: [],
      alternateGames: gameSelection.alternatives,
      analytics: {
        historyCount: history.length,
        validModelCount: 0,
        modelWeightsKnown: Object.keys(modelWeights).length,
        topConsensusNumbers: [] as Array<{ number: number; vote: number }>,
        topModels: [] as Array<{ modelName: string; usefulness: number }>,
      },
    };
  }

  const usefulnessMap = new Map<string, number>();
  for (const prediction of validPredictions) {
    usefulnessMap.set(
      prediction.modelName,
      scoreModelUsefulness({
        prediction,
        cfgMainCount: cfg.mainCount,
        modelWeights,
        modelPerf: modelPerfMap,
      })
    );
  }

  const numberConsensus = buildNumberConsensusMap(validPredictions, usefulnessMap);
  const maxVote = Math.max(...numberConsensus.values(), 0.0001);
  const patternProfile = buildPatternProfile(cfg.mainMax, history);

  const scoredCandidates: CandidateScore[] = validPredictions.map(prediction => {
    const modelUsefulness = usefulnessMap.get(prediction.modelName) ?? 0.45;
    const consensusSupport =
      prediction.mainNumbers.length > 0
        ? prediction.mainNumbers.reduce((sum, number) => {
          return sum + (numberConsensus.get(number) || 0) / maxVote;
        }, 0) / prediction.mainNumbers.length
        : 0;
    const pattern = evaluatePatternSupport(prediction.mainNumbers, cfg.mainCount, patternProfile);
    const finalScore = clamp(
      0.35 * clamp(prediction.confidenceScore) +
      0.3 * modelUsefulness +
      0.2 * consensusSupport +
      0.1 * pattern.score +
      0.05 * personalScore
    );

    return {
      modelName: prediction.modelName,
      mainNumbers: prediction.mainNumbers,
      specialNumbers: prediction.specialNumbers,
      confidenceScore: clamp(prediction.confidenceScore),
      modelUsefulness,
      consensusSupport,
      patternSupport: pattern.score,
      finalScore,
      reasons: [
        `${prediction.modelName.replace(/_/g, " ")} form ${Math.round(modelUsefulness * 100)}%.`,
        `Consensus support ${Math.round(consensusSupport * 100)}%.`,
        ...pattern.notes.slice(0, 2),
      ],
    };
  });

  scoredCandidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.modelUsefulness !== a.modelUsefulness) return b.modelUsefulness - a.modelUsefulness;
    return canonicalCandidateKey(a.mainNumbers, a.specialNumbers).localeCompare(
      canonicalCandidateKey(b.mainNumbers, b.specialNumbers)
    );
  });

  const uniqueCandidates: CandidateScore[] = [];
  const seen = new Set<string>();
  for (const candidate of scoredCandidates) {
    const key = canonicalCandidateKey(candidate.mainNumbers, candidate.specialNumbers);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }

  const primary = uniqueCandidates[0];
  const backups = uniqueCandidates.slice(1, 1 + backupCount);

  const topConsensusNumbers = [...numberConsensus.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(8, cfg.mainCount + 2))
    .map(([number, vote]) => ({ number, vote: round3(vote / maxVote) }));

  const topModels = [...usefulnessMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([modelName, usefulness]) => ({ modelName, usefulness: round3(usefulness) }));

  const dataQuality = clamp((history.length / 140) * 0.65 + (validPredictions.length / 18) * 0.35);
  const confidence = clamp(primary.finalScore * (0.7 + 0.3 * dataQuality));
  const confidenceLabel = toConfidenceLabel(confidence);

  return {
    generatedAt: new Date().toISOString(),
    gameType: selectedGameType,
    gameName: cfg.name,
    nextDrawIso: gameSelection.selected.nextDrawIso,
    nextDrawCountdown: gameSelection.selected.nextDrawCountdown,
    confidenceLabel,
    summary: `Play ${cfg.name} tonight. Primary pick confidence is ${Math.round(
      confidence * 100
    )}% from model form, number consensus, pattern fit, and your personal history.`,
    recommendation: {
      modelSource: primary.modelName,
      mainNumbers: primary.mainNumbers,
      specialNumbers: primary.specialNumbers,
      confidence: round3(confidence),
      breakdown: {
        consensusScore: round3(primary.consensusSupport),
        patternFitScore: round3(primary.patternSupport),
        modelFormScore: round3(primary.modelUsefulness),
        personalScore: round3(personalScore),
      },
      reasons: primary.reasons,
    },
    backups: backups.map(candidate => ({
      modelSource: candidate.modelName,
      mainNumbers: candidate.mainNumbers,
      specialNumbers: candidate.specialNumbers,
      confidence: round3(candidate.finalScore),
      reasons: candidate.reasons,
    })),
    alternateGames: gameSelection.alternatives,
    analytics: {
      historyCount: history.length,
      validModelCount: validPredictions.length,
      modelWeightsKnown: Object.keys(modelWeights).length,
      topConsensusNumbers,
      topModels,
    },
  };
}
