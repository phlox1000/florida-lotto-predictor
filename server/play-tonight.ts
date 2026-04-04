/**
 * Play Tonight Scoring Engine
 *
 * Computes a composite "Play Tonight" score for each ticket in a budget selection.
 * The formula uses five weighted components:
 *
 *   finalScore = 0.35 * confidenceScore
 *              + 0.30 * modelUsefulness
 *              + 0.20 * consensusSupport
 *              + 0.10 * patternScore
 *              + 0.05 * personalScore
 *
 * Each component is normalized to [0, 1]. The scoringBreakdown field in the
 * response makes every coefficient and component value fully transparent.
 */
import type { GameConfig, PredictionResult } from "../shared/lottery";

// ─── Coefficient Weights ──────────────────────────────────────────────────────

export const SCORING_WEIGHTS = {
  confidenceScore: 0.35,
  modelUsefulness: 0.30,
  consensusSupport: 0.20,
  patternScore: 0.10,
  personalScore: 0.05,
} as const;

// ─── Component Calculators ────────────────────────────────────────────────────

/**
 * confidenceScore: direct from the model's own confidence (already 0-1).
 */
function getConfidenceScore(pred: PredictionResult): number {
  return Math.min(1, Math.max(0, pred.confidenceScore));
}

/**
 * modelUsefulness: derived from the model's accuracy weight.
 * If no weight data exists, defaults to 0.5.
 */
function getModelUsefulness(
  modelName: string,
  modelWeights: Record<string, number>
): number {
  return modelWeights[modelName] ?? 0.5;
}

/**
 * consensusSupport: what fraction of all valid models agree on this ticket's numbers.
 * For each number in the ticket, count how many models also picked it, then average.
 */
function getConsensusSupport(
  mainNumbers: number[],
  allPredictions: PredictionResult[]
): number {
  if (mainNumbers.length === 0 || allPredictions.length === 0) return 0;

  const validPreds = allPredictions.filter(
    p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data
  );
  if (validPreds.length <= 1) return 0;

  let totalAgreement = 0;
  for (const num of mainNumbers) {
    let count = 0;
    for (const pred of validPreds) {
      if (pred.mainNumbers.includes(num)) count++;
    }
    // Normalize: fraction of models that picked this number (exclude self)
    totalAgreement += count / validPreds.length;
  }
  return Math.min(1, totalAgreement / mainNumbers.length);
}

/**
 * patternScore: measures how well the ticket aligns with historical patterns.
 * Uses sum-range analysis: if the ticket's number sum falls within the
 * historical interquartile range, it scores higher.
 */
function getPatternScore(
  mainNumbers: number[],
  cfg: GameConfig,
  history: Array<{ mainNumbers: number[] }>
): number {
  if (mainNumbers.length === 0 || history.length < 5) return 0.5; // neutral

  // Compute historical sum distribution
  const sums = history.map(h => h.mainNumbers.reduce((a, b) => a + b, 0));
  sums.sort((a, b) => a - b);
  const q1 = sums[Math.floor(sums.length * 0.25)];
  const q3 = sums[Math.floor(sums.length * 0.75)];
  const median = sums[Math.floor(sums.length * 0.5)];

  const ticketSum = mainNumbers.reduce((a, b) => a + b, 0);

  if (ticketSum >= q1 && ticketSum <= q3) {
    // Within IQR — good pattern alignment
    const distFromMedian = Math.abs(ticketSum - median);
    const iqrHalf = (q3 - q1) / 2;
    return iqrHalf > 0 ? Math.max(0.6, 1 - (distFromMedian / iqrHalf) * 0.4) : 0.8;
  }

  // Outside IQR — penalize proportionally
  const range = q3 - q1 || 1;
  const deviation = ticketSum < q1 ? (q1 - ticketSum) / range : (ticketSum - q3) / range;
  return Math.max(0, 0.5 - deviation * 0.3);
}

/**
 * personalScore: user-specific affinity. Currently based on whether the user
 * has personalization metrics stored. Defaults to 0.5 (neutral) when no
 * personalization data is available.
 */
function getPersonalScore(
  _modelName: string,
  personalMetrics?: Record<string, number>
): number {
  if (!personalMetrics || Object.keys(personalMetrics).length === 0) return 0.5;
  // If user has tracked this model's performance, use their personal weight
  return personalMetrics[_modelName] ?? 0.5;
}

// ─── Scoring Breakdown Type ───────────────────────────────────────────────────

export interface ScoringBreakdown {
  confidenceScore: { value: number; weight: number; weighted: number };
  modelUsefulness: { value: number; weight: number; weighted: number };
  consensusSupport: { value: number; weight: number; weighted: number };
  patternScore: { value: number; weight: number; weighted: number };
  personalScore: { value: number; weight: number; weighted: number };
  finalScore: number;
}

export interface ScoredTicket {
  mainNumbers: number[];
  specialNumbers: number[];
  modelSource: string;
  confidence: number;
  scoringBreakdown: ScoringBreakdown;
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

/**
 * Score a set of budget tickets using the Play Tonight formula.
 * Returns the same tickets with an added `scoringBreakdown` field.
 */
export function scorePlayTonightTickets(
  tickets: Array<{ mainNumbers: number[]; specialNumbers: number[]; modelSource: string; confidence: number }>,
  allPredictions: PredictionResult[],
  modelWeights: Record<string, number>,
  cfg: GameConfig,
  history: Array<{ mainNumbers: number[] }>,
  personalMetrics?: Record<string, number>
): ScoredTicket[] {
  return tickets.map(ticket => {
    const cs = getConfidenceScore({
      modelName: ticket.modelSource,
      mainNumbers: ticket.mainNumbers,
      specialNumbers: ticket.specialNumbers,
      confidenceScore: ticket.confidence,
      metadata: {},
    });
    const mu = getModelUsefulness(ticket.modelSource, modelWeights);
    const con = getConsensusSupport(ticket.mainNumbers, allPredictions);
    const ps = getPatternScore(ticket.mainNumbers, cfg, history);
    const pers = getPersonalScore(ticket.modelSource, personalMetrics);

    const finalScore =
      SCORING_WEIGHTS.confidenceScore * cs +
      SCORING_WEIGHTS.modelUsefulness * mu +
      SCORING_WEIGHTS.consensusSupport * con +
      SCORING_WEIGHTS.patternScore * ps +
      SCORING_WEIGHTS.personalScore * pers;

    const round4 = (n: number) => Math.round(n * 10000) / 10000;

    return {
      mainNumbers: ticket.mainNumbers,
      specialNumbers: ticket.specialNumbers,
      modelSource: ticket.modelSource,
      confidence: ticket.confidence,
      scoringBreakdown: {
        confidenceScore: {
          value: round4(cs),
          weight: SCORING_WEIGHTS.confidenceScore,
          weighted: round4(SCORING_WEIGHTS.confidenceScore * cs),
        },
        modelUsefulness: {
          value: round4(mu),
          weight: SCORING_WEIGHTS.modelUsefulness,
          weighted: round4(SCORING_WEIGHTS.modelUsefulness * mu),
        },
        consensusSupport: {
          value: round4(con),
          weight: SCORING_WEIGHTS.consensusSupport,
          weighted: round4(SCORING_WEIGHTS.consensusSupport * con),
        },
        patternScore: {
          value: round4(ps),
          weight: SCORING_WEIGHTS.patternScore,
          weighted: round4(SCORING_WEIGHTS.patternScore * ps),
        },
        personalScore: {
          value: round4(pers),
          weight: SCORING_WEIGHTS.personalScore,
          weighted: round4(SCORING_WEIGHTS.personalScore * pers),
        },
        finalScore: round4(finalScore),
      },
    };
  });
}
