import type { GameConfig, PredictionResult } from "../shared/lottery";

export const RANKER_V2_ALGORITHM = "online_logistic_regression";
export const RANKER_V2_FEATURE_SET = "ranker_v2_structured_2026_03";

export interface RankerState {
  id?: number;
  gameType: string;
  algorithm: string;
  featureSetVersion: string;
  intercept: number;
  coefficients: Record<string, number>;
  learningRate: number;
  l2Lambda: number;
  trainedExamples: number;
}

export interface CandidateFeatureRecord {
  modelName: string;
  candidateKey: string;
  mainNumbers: number[];
  specialNumbers: number[];
  baseConfidenceScore: number;
  isInsufficientData: boolean;
  metadata: Record<string, unknown>;
  features: Record<string, number>;
}

export interface RankedCandidate extends CandidateFeatureRecord {
  rankerScore: number;
  rankerProbability: number;
  rankPosition: number;
  selectedForFinal: boolean;
}

export interface TrainingExample {
  features: Record<string, number>;
  rewardScore: number;
  sourceType?: "generated_candidate" | "scanned_ticket";
  trainingWeight?: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

export function canonicalCandidateKey(
  mainNumbers: number[],
  specialNumbers: number[]
): string {
  const main = [...mainNumbers].sort((a, b) => a - b).join(",");
  const special = [...specialNumbers].sort((a, b) => a - b).join(",");
  return `${main}|${special}`;
}

export function getDefaultRankerState(gameType: string): RankerState {
  return {
    gameType,
    algorithm: RANKER_V2_ALGORITHM,
    featureSetVersion: RANKER_V2_FEATURE_SET,
    intercept: -0.2,
    // Small, auditable priors (all deterministic and bounded feature inputs).
    coefficients: {
      base_confidence: 1.0,
      top_freq_overlap: 0.6,
      consensus_overlap: 0.5,
      model_weight_prior: 0.4,
      model_avg_hits_prior: 0.3,
      odd_balance: 0.2,
      spread_norm: 0.15,
      unique_ratio: 0.2,
      insufficient_penalty: -1.4,
    },
    learningRate: 0.05,
    l2Lambda: 0.001,
    trainedExamples: 0,
  };
}

function safeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function overlapRatio(values: number[], set: Set<number>): number {
  if (values.length === 0) return 0;
  const overlap = values.filter(n => set.has(n)).length;
  return overlap / values.length;
}

function buildTopFrequencySet(cfg: GameConfig, history: Array<{ mainNumbers: number[] }>): Set<number> {
  if (history.length === 0) return new Set<number>();
  const freq = new Map<number, number>();
  for (const draw of history) {
    for (const number of draw.mainNumbers) {
      freq.set(number, (freq.get(number) || 0) + 1);
    }
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const keep = Math.max(cfg.mainCount, Math.ceil(cfg.mainMax * 0.2));
  return new Set(sorted.slice(0, keep).map(([n]) => n));
}

function buildConsensusSet(
  cfg: GameConfig,
  predictions: PredictionResult[]
): Set<number> {
  const votes = new Map<number, number>();
  for (const prediction of predictions) {
    const voteWeight = clamp01(prediction.confidenceScore) || 0.05;
    for (const number of prediction.mainNumbers) {
      votes.set(number, (votes.get(number) || 0) + voteWeight);
    }
  }
  const ranked = [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cfg.mainCount)
    .map(([n]) => n);
  return new Set(ranked);
}

function normalizeSpread(mainNumbers: number[], cfg: GameConfig): number {
  if (mainNumbers.length <= 1) return 0;
  const sorted = [...mainNumbers].sort((a, b) => a - b);
  const spread = sorted[sorted.length - 1] - sorted[0];
  const maxSpread = Math.max(1, cfg.mainMax - 1);
  return clamp01(spread / maxSpread);
}

function oddBalance(mainNumbers: number[]): number {
  if (mainNumbers.length === 0) return 0;
  const oddRatio = mainNumbers.filter(n => Math.abs(n % 2) === 1).length / mainNumbers.length;
  return clamp01(1 - Math.abs(oddRatio - 0.5) * 2);
}

export function computeCandidateFeatures(
  cfg: GameConfig,
  history: Array<{ mainNumbers: number[]; specialNumbers: number[]; drawDate: number }>,
  predictions: PredictionResult[],
  modelWeights: Record<string, number>,
  modelAvgHits: Record<string, number>
): CandidateFeatureRecord[] {
  const topFrequencySet = buildTopFrequencySet(cfg, history);
  const consensusSet = buildConsensusSet(cfg, predictions);

  const keyFrequency = new Map<string, number>();
  for (const prediction of predictions) {
    const key = canonicalCandidateKey(prediction.mainNumbers, prediction.specialNumbers || []);
    keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
  }

  return predictions.map(prediction => {
    const key = canonicalCandidateKey(prediction.mainNumbers, prediction.specialNumbers || []);
    const mainNumbers = [...prediction.mainNumbers];
    const specialNumbers = [...prediction.specialNumbers];
    const insufficient = prediction.metadata?.insufficient_data === true;

    const features: Record<string, number> = {
      base_confidence: clamp01(prediction.confidenceScore),
      top_freq_overlap: overlapRatio(mainNumbers, topFrequencySet),
      consensus_overlap: overlapRatio(mainNumbers, consensusSet),
      model_weight_prior: clamp01(modelWeights[prediction.modelName] ?? 0.5),
      model_avg_hits_prior: clamp01((modelAvgHits[prediction.modelName] ?? 0) / Math.max(1, cfg.mainCount)),
      odd_balance: oddBalance(mainNumbers),
      spread_norm: normalizeSpread(mainNumbers, cfg),
      unique_ratio: mainNumbers.length > 0 ? clamp01(new Set(mainNumbers).size / mainNumbers.length) : 0,
      candidate_duplication_penalty: clamp01(((keyFrequency.get(key) || 1) - 1) / predictions.length),
      special_presence: cfg.specialCount > 0 ? clamp01(specialNumbers.length / cfg.specialCount) : 0,
      insufficient_penalty: insufficient ? 1 : 0,
      history_depth_norm: clamp01(history.length / 200),
      main_mean_norm: mainNumbers.length > 0 ? clamp01(safeAverage(mainNumbers) / Math.max(1, cfg.mainMax)) : 0,
    };

    return {
      modelName: prediction.modelName,
      candidateKey: key,
      mainNumbers,
      specialNumbers,
      baseConfidenceScore: clamp01(prediction.confidenceScore),
      isInsufficientData: insufficient,
      metadata: prediction.metadata || {},
      features,
    };
  });
}

function scoreFeatures(features: Record<string, number>, state: RankerState): { score: number; probability: number } {
  let score = state.intercept;
  for (const [featureName, value] of Object.entries(features)) {
    const coefficient = state.coefficients[featureName] ?? 0;
    score += coefficient * value;
  }
  return { score, probability: clamp01(sigmoid(score)) };
}

export function rankCandidates(
  featureRecords: CandidateFeatureRecord[],
  rankerState: RankerState
): RankedCandidate[] {
  const scored = featureRecords.map(record => {
    const { score, probability } = scoreFeatures(record.features, rankerState);
    return {
      ...record,
      rankerScore: score,
      rankerProbability: probability,
      rankPosition: 0,
      selectedForFinal: false,
    };
  });

  scored.sort((a, b) =>
    b.rankerProbability - a.rankerProbability ||
    b.baseConfidenceScore - a.baseConfidenceScore ||
    a.candidateKey.localeCompare(b.candidateKey)
  );
  scored.forEach((candidate, idx) => {
    candidate.rankPosition = idx + 1;
  });
  return scored;
}

function overlapCount(a: number[], b: number[]): number {
  const bSet = new Set(b);
  return a.filter(n => bSet.has(n)).length;
}

/**
 * Deterministic diversification: keep high-ranked candidates but reject near-duplicates.
 */
export function diversifyRankedCandidates(
  ranked: RankedCandidate[],
  cfg: GameConfig,
  targetCount: number
): RankedCandidate[] {
  const selected: RankedCandidate[] = [];
  const maxMainOverlap = Math.max(1, cfg.mainCount - 2);
  const maxSpecialOverlap = Math.max(0, cfg.specialCount - 1);

  for (const candidate of ranked) {
    if (selected.length >= targetCount) break;
    const tooSimilar = selected.some(existing => {
      const mainOverlap = overlapCount(candidate.mainNumbers, existing.mainNumbers);
      const specialOverlap = overlapCount(candidate.specialNumbers, existing.specialNumbers);
      return mainOverlap > maxMainOverlap || specialOverlap > maxSpecialOverlap;
    });
    if (!tooSimilar) {
      candidate.selectedForFinal = true;
      selected.push(candidate);
    }
  }

  // Ensure we always return at least one candidate when available.
  if (selected.length === 0 && ranked.length > 0) {
    ranked[0].selectedForFinal = true;
    selected.push(ranked[0]);
  }

  return selected;
}

export function mergeRankedCandidatesIntoPredictions(
  predictions: PredictionResult[],
  ranked: RankedCandidate[]
): PredictionResult[] {
  const byKey = new Map<string, RankedCandidate>();
  for (const candidate of ranked) {
    byKey.set(candidate.candidateKey, candidate);
  }

  const enriched = predictions.map(prediction => {
    const key = canonicalCandidateKey(prediction.mainNumbers, prediction.specialNumbers || []);
    const rankedCandidate = byKey.get(key);
    if (!rankedCandidate) return prediction;
    return {
      ...prediction,
      confidenceScore: rankedCandidate.rankerProbability,
      metadata: {
        ...(prediction.metadata || {}),
        ranker: {
          version: RANKER_V2_FEATURE_SET,
          probability: rankedCandidate.rankerProbability,
          score: rankedCandidate.rankerScore,
          rankPosition: rankedCandidate.rankPosition,
          selectedForFinal: rankedCandidate.selectedForFinal,
          baseConfidenceScore: rankedCandidate.baseConfidenceScore,
        },
      },
    };
  });

  return enriched.sort((a, b) => {
    const aKey = canonicalCandidateKey(a.mainNumbers, a.specialNumbers || []);
    const bKey = canonicalCandidateKey(b.mainNumbers, b.specialNumbers || []);
    const aRank = byKey.get(aKey)?.rankPosition ?? Number.MAX_SAFE_INTEGER;
    const bRank = byKey.get(bKey)?.rankPosition ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || b.confidenceScore - a.confidenceScore;
  });
}

export function computeRewardScore(
  cfg: GameConfig,
  mainHits: number,
  specialHits: number
): number {
  const mainRatio = cfg.mainCount > 0 ? clamp01(mainHits / cfg.mainCount) : 0;
  const specialRatio = cfg.specialCount > 0 ? clamp01(specialHits / cfg.specialCount) : 0;

  const fullMain = mainHits === cfg.mainCount;
  const fullSpecial = cfg.specialCount === 0 || specialHits === cfg.specialCount;

  let score = mainRatio * 0.75 + specialRatio * 0.15;
  if (mainHits >= Math.max(1, cfg.mainCount - 1)) score += 0.1;
  if (fullMain && fullSpecial) score += 0.25;

  return clamp01(score);
}

export function rewardTier(
  cfg: GameConfig,
  mainHits: number,
  specialHits: number,
  rewardScore: number
): string {
  const isJackpot = mainHits === cfg.mainCount && (cfg.specialCount === 0 || specialHits === cfg.specialCount);
  if (isJackpot) return "jackpot";
  if (rewardScore >= 0.75) return "strong";
  if (rewardScore >= 0.4) return "partial";
  if (rewardScore > 0) return "minor";
  return "miss";
}

export function trainOnlineLogisticRegression(
  state: RankerState,
  examples: TrainingExample[]
): RankerState {
  if (examples.length === 0) return state;

  const next: RankerState = {
    ...state,
    coefficients: { ...state.coefficients },
  };

  const learningRate = Math.max(0.0001, state.learningRate);
  const l2 = Math.max(0, state.l2Lambda);

  for (const example of examples) {
    const weight = Math.max(0.01, Math.min(1, Number(example.trainingWeight ?? 1)));
    const y = clamp01(example.rewardScore);
    const { probability } = scoreFeatures(example.features, next);
    const error = (probability - y) * weight;

    next.intercept -= learningRate * error;

    for (const [name, rawValue] of Object.entries(example.features)) {
      const value = clamp01(rawValue);
      const prev = next.coefficients[name] ?? 0;
      const grad = error * value + l2 * prev;
      next.coefficients[name] = prev - learningRate * grad;
    }
  }

  next.trainedExamples = state.trainedExamples + examples.length;
  return next;
}

export function computeScannedTicketFeatures(params: {
  cfg: GameConfig;
  mainNumbers: number[];
  specialNumbers: number[];
  ticketOrigin: "user_selected" | "quick_pick" | "unknown";
  sourceModelWeight?: number;
  sourceModelAvgHits?: number;
  historyDepth?: number;
  sourceConfidence?: number;
}): Record<string, number> {
  const {
    cfg,
    mainNumbers,
    specialNumbers,
    ticketOrigin,
    sourceModelWeight = 0.5,
    sourceModelAvgHits = 0,
    historyDepth = 0,
    sourceConfidence = 0.5,
  } = params;
  const clampedSourceConfidence = clamp01(sourceConfidence);
  return {
    base_confidence: clampedSourceConfidence,
    top_freq_overlap: 0,
    consensus_overlap: 0,
    model_weight_prior: clamp01(sourceModelWeight),
    model_avg_hits_prior: clamp01(sourceModelAvgHits / Math.max(1, cfg.mainCount)),
    odd_balance: oddBalance(mainNumbers),
    spread_norm: normalizeSpread(mainNumbers, cfg),
    unique_ratio: mainNumbers.length > 0 ? clamp01(new Set(mainNumbers).size / mainNumbers.length) : 0,
    candidate_duplication_penalty: 0,
    special_presence: cfg.specialCount > 0 ? clamp01(specialNumbers.length / cfg.specialCount) : 0,
    insufficient_penalty: 0,
    history_depth_norm: clamp01(historyDepth / 200),
    main_mean_norm: mainNumbers.length > 0 ? clamp01(safeAverage(mainNumbers) / Math.max(1, cfg.mainMax)) : 0,
    source_scanned_ticket: 1,
    source_generated_candidate: 0,
    ticketOrigin_quick_pick: ticketOrigin === "quick_pick" ? 1 : 0,
    ticketOrigin_user_selected: ticketOrigin === "user_selected" ? 1 : 0,
    ticketOrigin_unknown: ticketOrigin === "unknown" ? 1 : 0,
  };
}

export function buildTrainingExamplesWithSourceWeights(params: {
  generatedExamples: Array<{ features: Record<string, number>; rewardScore: number }>;
  scannedExamples: Array<{ features: Record<string, number>; rewardScore: number; baseWeight?: number }>;
  scannedCapRatio?: number;
  scannedBaseWeight?: number;
}): {
  examples: TrainingExample[];
  generatedCount: number;
  scannedCount: number;
} {
  const generatedCount = params.generatedExamples.length;
  const scannedCapRatio = params.scannedCapRatio ?? 0.4;
  const scannedBaseWeight = params.scannedBaseWeight ?? 0.35;
  const scannedMax = Math.floor(Math.max(0, generatedCount) * Math.max(0, Math.min(1, scannedCapRatio)));
  const cappedScanned = params.scannedExamples
    .slice(0, scannedMax > 0 ? scannedMax : (generatedCount === 0 ? params.scannedExamples.length : 0))
    .map(example => ({
      ...example,
      trainingWeight: Math.max(0.01, Math.min(1, Number(example.baseWeight ?? scannedBaseWeight))),
    }));

  const weightedGenerated = params.generatedExamples.map(example => ({
    ...example,
    trainingWeight: 1,
  }));

  return {
    examples: [...weightedGenerated, ...cappedScanned],
    generatedCount: weightedGenerated.length,
    scannedCount: cappedScanned.length,
  };
}

export function selectBudgetTicketsFromRankedCandidates(
  cfg: GameConfig,
  rankedCandidates: RankedCandidate[],
  budget: number = 75,
  maxTickets: number = 20,
): { tickets: Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }>; totalCost: number } {
  const affordableCount = Math.min(maxTickets, Math.floor(budget / cfg.ticketPrice));
  if (affordableCount <= 0 || rankedCandidates.length === 0) {
    return { tickets: [], totalCost: 0 };
  }

  const ordered = [...rankedCandidates].sort((a, b) =>
    a.rankPosition - b.rankPosition ||
    b.rankerProbability - a.rankerProbability
  );
  const diversified = diversifyRankedCandidates(ordered, cfg, affordableCount);
  const used = new Set(diversified.map(c => c.candidateKey));

  for (const candidate of ordered) {
    if (diversified.length >= affordableCount) break;
    if (used.has(candidate.candidateKey)) continue;
    candidate.selectedForFinal = true;
    diversified.push(candidate);
    used.add(candidate.candidateKey);
  }

  const tickets = diversified.slice(0, affordableCount).map(candidate => ({
    mainNumbers: [...candidate.mainNumbers],
    specialNumbers: [...candidate.specialNumbers],
    modelSource: candidate.modelName,
    confidence: candidate.rankerProbability,
  }));

  return {
    tickets,
    totalCost: tickets.length * cfg.ticketPrice,
  };
}
