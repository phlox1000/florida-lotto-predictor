import crypto from "node:crypto";
import { and, avg, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  personalizationMetrics,
  predictionCandidates,
  type InsertPersonalizationMetric,
} from "../drizzle/schema";
import { getDb, getDatabaseSchemaSanitySnapshot } from "./db";
import { FLORIDA_GAMES, type GameType } from "../shared/lottery";
import { computeRewardScore } from "./ranker-v2";

export type PersonalizationAbGroup = "control" | "treatment" | "ineligible";

export interface CandidateRankSnapshot {
  candidateKey: string;
  rankPosition: number;
  probability: number;
}

export interface PersonalizationAbAssignment {
  group: PersonalizationAbGroup;
  bucket: number | null;
  personalizationAllowed: boolean;
}

export interface PersonalizationRequestMetricInput {
  gameType: string;
  requestSource: "predictions.generate" | "tickets.generate";
  userId: number | null;
  candidateBatchId: number | null;
  globalRankerVersionId: number | null;
  personalRankerVersionId: number | null;
  personalizationEligible: boolean;
  personalizationApplied: boolean;
  personalizationBlockedReason: string | null;
  blendWeight: number;
  abGroup: PersonalizationAbGroup;
  abBucket: number | null;
  topN: number;
  topGlobalCandidates: CandidateRankSnapshot[];
  topServedCandidates: CandidateRankSnapshot[];
  selectedCandidateKeys: string[];
  selectedCandidateKey: string | null;
  selectedCandidateSource: string | null;
}

function personalizationMetricsAvailable(): boolean {
  return getDatabaseSchemaSanitySnapshot().personalizationMetricsAvailable;
}

function parseIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || "");
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
}

export function getPersonalizationMetricsConfig() {
  const abControlPercentRaw = parseIntEnv("PERSONALIZATION_AB_CONTROL_PERCENT", 0);
  return {
    topN: Math.max(1, Math.min(25, parseIntEnv("PERSONALIZATION_METRICS_TOP_N", 10))),
    abControlPercent: Math.max(0, Math.min(100, abControlPercentRaw)),
    hashSalt:
      process.env.PERSONALIZATION_METRICS_HASH_SALT ||
      process.env.JWT_SECRET ||
      "personalization-metrics-salt",
    impactLookbackDays: Math.max(
      1,
      Math.min(365, parseIntEnv("PERSONALIZATION_METRICS_LOOKBACK_DAYS", 90))
    ),
  };
}

export function anonymizeUserId(userId: number | null): string | null {
  if (!userId) return null;
  const { hashSalt } = getPersonalizationMetricsConfig();
  const digest = crypto
    .createHash("sha256")
    .update(`${hashSalt}:${userId}`)
    .digest("hex");
  return digest.slice(0, 24);
}

export function deterministicAbBucket(userId: number, gameType: string): number {
  const { hashSalt } = getPersonalizationMetricsConfig();
  const digest = crypto
    .createHash("sha256")
    .update(`${hashSalt}:ab:${userId}:${gameType}`)
    .digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
}

export function assignPersonalizationAbGroup(params: {
  userId: number | null;
  gameType: string;
  personalizationEligible: boolean;
}): PersonalizationAbAssignment {
  if (!params.userId || !params.personalizationEligible) {
    return { group: "ineligible", bucket: null, personalizationAllowed: false };
  }
  const cfg = getPersonalizationMetricsConfig();
  const bucket = deterministicAbBucket(params.userId, params.gameType);
  const group: PersonalizationAbGroup =
    bucket < cfg.abControlPercent ? "control" : "treatment";
  return {
    group,
    bucket,
    personalizationAllowed: group === "treatment",
  };
}

export function snapshotTopCandidates(
  ranked: Array<{ candidateKey: string; rankPosition: number; rankerProbability: number }>,
  topN: number
): CandidateRankSnapshot[] {
  return ranked.slice(0, topN).map(candidate => ({
    candidateKey: candidate.candidateKey,
    rankPosition: Number(candidate.rankPosition) || 0,
    probability: Number(candidate.rankerProbability) || 0,
  }));
}

export function resolveSelectedCandidateSource(params: {
  selectedCandidateKey: string | null;
  personalizationApplied: boolean;
  baselineRankByKey: Map<string, number>;
  servedRankByKey: Map<string, number>;
}): string | null {
  const selectedKey = params.selectedCandidateKey;
  if (!selectedKey) return null;
  const baselineRank = params.baselineRankByKey.get(selectedKey);
  const servedRank = params.servedRankByKey.get(selectedKey);
  if (!baselineRank || !servedRank) return "outside_ranked_candidates";
  if (params.personalizationApplied && servedRank < baselineRank) {
    return "personal_reranker_adjustment";
  }
  return "global_ranking";
}

async function persistPersonalizationRequestMetric(
  input: PersonalizationRequestMetricInput
): Promise<void> {
  if (!personalizationMetricsAvailable()) {
    console.error("[PersonalizationMetrics] persistence disabled: missing personalization_metrics table");
    return;
  }
  const db = await getDb();
  if (!db) return;

  const row: InsertPersonalizationMetric = {
    gameType: input.gameType,
    requestSource: input.requestSource,
    anonymizedUserId: anonymizeUserId(input.userId),
    candidateBatchId: input.candidateBatchId,
    globalRankerVersionId: input.globalRankerVersionId,
    personalRankerVersionId: input.personalRankerVersionId,
    abGroup: input.abGroup,
    abBucket: input.abBucket,
    personalizationEligible: input.personalizationEligible ? 1 : 0,
    personalizationApplied: input.personalizationApplied ? 1 : 0,
    personalizationBlockedReason: input.personalizationBlockedReason || null,
    blendWeight: input.blendWeight,
    topN: input.topN,
    topGlobalCandidates: input.topGlobalCandidates,
    topServedCandidates: input.topServedCandidates,
    selectedCandidateKeys: input.selectedCandidateKeys,
    selectedCandidateKey: input.selectedCandidateKey,
    selectedCandidateSource: input.selectedCandidateSource,
  };
  await db.insert(personalizationMetrics).values(row).onDuplicateKeyUpdate({
    set: {
      gameType: row.gameType,
      requestSource: row.requestSource,
      anonymizedUserId: row.anonymizedUserId,
      globalRankerVersionId: row.globalRankerVersionId,
      personalRankerVersionId: row.personalRankerVersionId,
      abGroup: row.abGroup,
      abBucket: row.abBucket,
      personalizationEligible: row.personalizationEligible,
      personalizationApplied: row.personalizationApplied,
      personalizationBlockedReason: row.personalizationBlockedReason,
      blendWeight: row.blendWeight,
      topN: row.topN,
      topGlobalCandidates: row.topGlobalCandidates,
      topServedCandidates: row.topServedCandidates,
      selectedCandidateKeys: row.selectedCandidateKeys,
      selectedCandidateKey: row.selectedCandidateKey,
      selectedCandidateSource: row.selectedCandidateSource,
    },
  });
}

export function enqueuePersonalizationRequestMetric(
  input: PersonalizationRequestMetricInput
): void {
  const run = () => {
    void persistPersonalizationRequestMetric(input).catch(error => {
      console.warn("[PersonalizationMetrics] failed request metric insert:", error);
    });
  };
  if (typeof setImmediate === "function") {
    setImmediate(run);
    return;
  }
  Promise.resolve().then(run);
}

function parseCandidateSnapshots(value: unknown): CandidateRankSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): CandidateRankSnapshot | null => {
      if (!row || typeof row !== "object") return null;
      const candidateKey = String((row as any).candidateKey || "");
      if (!candidateKey) return null;
      return {
        candidateKey,
        rankPosition: Number((row as any).rankPosition) || 0,
        probability: Number((row as any).probability) || 0,
      };
    })
    .filter((row): row is CandidateRankSnapshot => Boolean(row));
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v || "")).filter(Boolean);
}

function parseCandidateKey(candidateKey: string): { main: number[]; special: number[] } {
  const [mainRaw, specialRaw] = String(candidateKey).split("|");
  const parsePart = (part: string | undefined): number[] =>
    String(part || "")
      .split(",")
      .map(v => Number(v))
      .filter(Number.isFinite);
  return {
    main: parsePart(mainRaw),
    special: parsePart(specialRaw),
  };
}

function scoreCandidateKey(params: {
  gameType: string;
  candidateKey: string;
  winningMainSet: Set<number>;
  winningSpecialSet: Set<number>;
}): { mainHits: number; specialHits: number; rewardScore: number } {
  const cfg = FLORIDA_GAMES[params.gameType as GameType];
  if (!cfg) return { mainHits: 0, specialHits: 0, rewardScore: 0 };
  const { main, special } = parseCandidateKey(params.candidateKey);
  const mainHits = main.filter(n => params.winningMainSet.has(n)).length;
  const specialHits = special.filter(n => params.winningSpecialSet.has(n)).length;
  return {
    mainHits,
    specialHits,
    rewardScore: computeRewardScore(cfg, mainHits, specialHits),
  };
}

function precisionAtK(params: {
  snapshots: CandidateRankSnapshot[];
  k: number;
  gameType: string;
  winningMainSet: Set<number>;
  winningSpecialSet: Set<number>;
}) {
  const rows = params.snapshots.slice(0, params.k);
  if (rows.length === 0) return { hit: 0, precision: 0 };
  const rewards = rows.map(snapshot =>
    scoreCandidateKey({
      gameType: params.gameType,
      candidateKey: snapshot.candidateKey,
      winningMainSet: params.winningMainSet,
      winningSpecialSet: params.winningSpecialSet,
    }).rewardScore
  );
  const hit = rewards.some(reward => reward > 0) ? 1 : 0;
  const precision = rewards.reduce((sum, reward) => sum + reward, 0) / rows.length;
  return { hit, precision };
}

export async function evaluatePersonalizationMetricsForDraw(params: {
  drawId: number;
  gameType: string;
  winningMain: number[];
  winningSpecial: number[];
}): Promise<{ evaluated: number }> {
  if (!personalizationMetricsAvailable()) return { evaluated: 0 };
  const db = await getDb();
  if (!db) return { evaluated: 0 };

  const evaluatedBatchRows = await db.select({
    batchId: predictionCandidates.batchId,
  }).from(predictionCandidates)
    .where(and(
      eq(predictionCandidates.gameType, params.gameType),
      eq(predictionCandidates.evaluatedDrawResultId, params.drawId),
      isNotNull(predictionCandidates.batchId),
    ))
    .groupBy(predictionCandidates.batchId);

  const batchIds = evaluatedBatchRows
    .map(row => Number(row.batchId))
    .filter(v => Number.isFinite(v) && v > 0);
  if (batchIds.length === 0) return { evaluated: 0 };

  const pending = await db.select({
    id: personalizationMetrics.id,
    topGlobalCandidates: personalizationMetrics.topGlobalCandidates,
    topServedCandidates: personalizationMetrics.topServedCandidates,
    selectedCandidateKeys: personalizationMetrics.selectedCandidateKeys,
    selectedCandidateKey: personalizationMetrics.selectedCandidateKey,
  }).from(personalizationMetrics)
    .where(and(
      eq(personalizationMetrics.gameType, params.gameType),
      isNull(personalizationMetrics.evaluatedDrawResultId),
      inArray(personalizationMetrics.candidateBatchId, batchIds),
    ))
    .limit(2000);

  if (pending.length === 0) return { evaluated: 0 };

  const winningMainSet = new Set(params.winningMain);
  const winningSpecialSet = new Set(params.winningSpecial);
  let updated = 0;

  for (const row of pending) {
    const baseline = parseCandidateSnapshots(row.topGlobalCandidates);
    const served = parseCandidateSnapshots(row.topServedCandidates);
    const selectedCandidateKeys = parseStringArray(row.selectedCandidateKeys);
    const selectedCandidateKey =
      (row.selectedCandidateKey ? String(row.selectedCandidateKey) : "") ||
      selectedCandidateKeys[0] ||
      served[0]?.candidateKey ||
      baseline[0]?.candidateKey ||
      "";

    const baselineRankByKey = new Map(
      baseline.map(snapshot => [snapshot.candidateKey, snapshot.rankPosition])
    );
    const servedRankByKey = new Map(
      served.map(snapshot => [snapshot.candidateKey, snapshot.rankPosition])
    );
    const baselineSelectedRank = baselineRankByKey.get(selectedCandidateKey) ?? null;
    const personalizedSelectedRank = servedRankByKey.get(selectedCandidateKey) ?? null;
    const selectedRankLift =
      baselineSelectedRank && personalizedSelectedRank
        ? baselineSelectedRank - personalizedSelectedRank
        : null;

    const selectedScore = selectedCandidateKey
      ? scoreCandidateKey({
          gameType: params.gameType,
          candidateKey: selectedCandidateKey,
          winningMainSet,
          winningSpecialSet,
        })
      : { mainHits: 0, specialHits: 0, rewardScore: 0 };

    const baseline5 = precisionAtK({
      snapshots: baseline,
      k: 5,
      gameType: params.gameType,
      winningMainSet,
      winningSpecialSet,
    });
    const served5 = precisionAtK({
      snapshots: served,
      k: 5,
      gameType: params.gameType,
      winningMainSet,
      winningSpecialSet,
    });
    const baseline10 = precisionAtK({
      snapshots: baseline,
      k: 10,
      gameType: params.gameType,
      winningMainSet,
      winningSpecialSet,
    });
    const served10 = precisionAtK({
      snapshots: served,
      k: 10,
      gameType: params.gameType,
      winningMainSet,
      winningSpecialSet,
    });

    await db.update(personalizationMetrics)
      .set({
        evaluatedDrawResultId: params.drawId,
        baselineSelectedRank,
        personalizedSelectedRank,
        selectedRankLift,
        selectedMainHits: selectedScore.mainHits,
        selectedSpecialHits: selectedScore.specialHits,
        selectedRewardScore: selectedScore.rewardScore,
        baselineHitAt5: baseline5.hit,
        personalizedHitAt5: served5.hit,
        baselineHitAt10: baseline10.hit,
        personalizedHitAt10: served10.hit,
        baselinePrecisionAt5: baseline5.precision,
        personalizedPrecisionAt5: served5.precision,
        baselinePrecisionAt10: baseline10.precision,
        personalizedPrecisionAt10: served10.precision,
        precisionLiftAt5: served5.precision - baseline5.precision,
        precisionLiftAt10: served10.precision - baseline10.precision,
        evaluatedAt: new Date(),
      })
      .where(eq(personalizationMetrics.id, row.id));
    updated++;
  }

  return { evaluated: updated };
}

function round3(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(3));
}

function percentImprovement(newValue: number | null, baseline: number | null): number | null {
  if (newValue === null || baseline === null || baseline === 0) return null;
  return round3(((newValue - baseline) / baseline) * 100);
}

export async function getPersonalizationImpactSummary(params?: {
  gameType?: string;
  lookbackDays?: number;
}) {
  if (!personalizationMetricsAvailable()) {
    return {
      sampleSize: 0,
      avgLift: null,
      percentImprovement: null,
      hitRateAt5: { baseline: null, personalized: null, improvementPercent: null },
      hitRateAt10: { baseline: null, personalized: null, improvementPercent: null },
      precisionAt5: { baseline: null, personalized: null, avgLift: null },
      precisionAt10: { baseline: null, personalized: null, avgLift: null },
      ab: { controlSampleSize: 0, treatmentSampleSize: 0, treatmentVsControlHitRateImprovementAt5Percent: null },
      unavailableReason: "missing_personalization_metrics_table",
    };
  }
  const db = await getDb();
  if (!db) {
    return {
      sampleSize: 0,
      avgLift: null,
      percentImprovement: null,
      hitRateAt5: { baseline: null, personalized: null, improvementPercent: null },
      hitRateAt10: { baseline: null, personalized: null, improvementPercent: null },
      precisionAt5: { baseline: null, personalized: null, avgLift: null },
      precisionAt10: { baseline: null, personalized: null, avgLift: null },
      ab: { controlSampleSize: 0, treatmentSampleSize: 0, treatmentVsControlHitRateImprovementAt5Percent: null },
    };
  }

  const lookbackDays =
    params?.lookbackDays ??
    getPersonalizationMetricsConfig().impactLookbackDays;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const whereClause = and(
    isNotNull(personalizationMetrics.evaluatedDrawResultId),
    gte(personalizationMetrics.createdAt, since),
    params?.gameType ? eq(personalizationMetrics.gameType, params.gameType) : sql`TRUE`
  );

  const aggregateRows = await db.select({
    sampleSize: sql<number>`COUNT(*)`,
    avgLift: avg(personalizationMetrics.selectedRankLift),
    baselineHitAt5: avg(personalizationMetrics.baselineHitAt5),
    personalizedHitAt5: avg(personalizationMetrics.personalizedHitAt5),
    baselineHitAt10: avg(personalizationMetrics.baselineHitAt10),
    personalizedHitAt10: avg(personalizationMetrics.personalizedHitAt10),
    baselinePrecisionAt5: avg(personalizationMetrics.baselinePrecisionAt5),
    personalizedPrecisionAt5: avg(personalizationMetrics.personalizedPrecisionAt5),
    baselinePrecisionAt10: avg(personalizationMetrics.baselinePrecisionAt10),
    personalizedPrecisionAt10: avg(personalizationMetrics.personalizedPrecisionAt10),
    avgPrecisionLiftAt5: avg(personalizationMetrics.precisionLiftAt5),
    avgPrecisionLiftAt10: avg(personalizationMetrics.precisionLiftAt10),
  }).from(personalizationMetrics).where(whereClause);

  const abRows = await db.select({
    group: personalizationMetrics.abGroup,
    sampleSize: sql<number>`COUNT(*)`,
    hitAt5: avg(personalizationMetrics.personalizedHitAt5),
  }).from(personalizationMetrics)
    .where(whereClause)
    .groupBy(personalizationMetrics.abGroup);

  const aggregate = aggregateRows[0];
  const sampleSize = Number(aggregate?.sampleSize || 0);
  const avgLift = round3(Number(aggregate?.avgLift ?? Number.NaN));
  const baselineHitAt5 = round3(Number(aggregate?.baselineHitAt5 ?? Number.NaN));
  const personalizedHitAt5 = round3(
    Number(aggregate?.personalizedHitAt5 ?? Number.NaN)
  );
  const baselineHitAt10 = round3(Number(aggregate?.baselineHitAt10 ?? Number.NaN));
  const personalizedHitAt10 = round3(
    Number(aggregate?.personalizedHitAt10 ?? Number.NaN)
  );
  const baselinePrecisionAt5 = round3(
    Number(aggregate?.baselinePrecisionAt5 ?? Number.NaN)
  );
  const personalizedPrecisionAt5 = round3(
    Number(aggregate?.personalizedPrecisionAt5 ?? Number.NaN)
  );
  const baselinePrecisionAt10 = round3(
    Number(aggregate?.baselinePrecisionAt10 ?? Number.NaN)
  );
  const personalizedPrecisionAt10 = round3(
    Number(aggregate?.personalizedPrecisionAt10 ?? Number.NaN)
  );
  const avgPrecisionLiftAt5 = round3(
    Number(aggregate?.avgPrecisionLiftAt5 ?? Number.NaN)
  );
  const avgPrecisionLiftAt10 = round3(
    Number(aggregate?.avgPrecisionLiftAt10 ?? Number.NaN)
  );

  const control = abRows.find(row => row.group === "control");
  const treatment = abRows.find(row => row.group === "treatment");
  const controlSampleSize = Number(control?.sampleSize || 0);
  const treatmentSampleSize = Number(treatment?.sampleSize || 0);
  const controlHitAt5 = round3(Number(control?.hitAt5 ?? Number.NaN));
  const treatmentHitAt5 = round3(Number(treatment?.hitAt5 ?? Number.NaN));

  return {
    sampleSize,
    avgLift,
    percentImprovement: percentImprovement(personalizedHitAt5, baselineHitAt5),
    hitRateAt5: {
      baseline: baselineHitAt5,
      personalized: personalizedHitAt5,
      improvementPercent: percentImprovement(personalizedHitAt5, baselineHitAt5),
    },
    hitRateAt10: {
      baseline: baselineHitAt10,
      personalized: personalizedHitAt10,
      improvementPercent: percentImprovement(personalizedHitAt10, baselineHitAt10),
    },
    precisionAt5: {
      baseline: baselinePrecisionAt5,
      personalized: personalizedPrecisionAt5,
      avgLift: avgPrecisionLiftAt5,
    },
    precisionAt10: {
      baseline: baselinePrecisionAt10,
      personalized: personalizedPrecisionAt10,
      avgLift: avgPrecisionLiftAt10,
    },
    ab: {
      controlSampleSize,
      treatmentSampleSize,
      treatmentVsControlHitRateImprovementAt5Percent: percentImprovement(
        treatmentHitAt5,
        controlHitAt5
      ),
    },
  };
}
