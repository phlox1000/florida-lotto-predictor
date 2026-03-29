import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLORIDA_GAMES } from "../shared/lottery";

const {
  mockGetDrawResults,
  mockGetModelWeights,
  mockGetModelAverageHitsMap,
  mockGetOrCreateActiveRankerVersion,
  mockGetActivePersonalRankerVersion,
  mockGetPersonalizationConfig,
  mockGetPersonalRankerStatus,
  mockGetPersonalTrainingSourceBreakdown,
  mockEvaluatePromotionEligibility,
  mockInsertPredictions,
  mockCreatePredictionCandidateBatch,
  mockStorePredictionCandidatesAndFeatures,
  mockGetPersonalizationMetricsConfig,
  mockAssignPersonalizationAbGroup,
  mockEnqueuePersonalizationRequestMetric,
  mockGetPersonalizationImpactSummary,
  mockRunAllModels,
  mockSelectBudgetTickets,
} = vi.hoisted(() => ({
  mockGetDrawResults: vi.fn(),
  mockGetModelWeights: vi.fn(),
  mockGetModelAverageHitsMap: vi.fn(),
  mockGetOrCreateActiveRankerVersion: vi.fn(),
  mockGetActivePersonalRankerVersion: vi.fn(),
  mockGetPersonalizationConfig: vi.fn(),
  mockGetPersonalRankerStatus: vi.fn(),
  mockGetPersonalTrainingSourceBreakdown: vi.fn(),
  mockEvaluatePromotionEligibility: vi.fn(),
  mockInsertPredictions: vi.fn(),
  mockCreatePredictionCandidateBatch: vi.fn(),
  mockStorePredictionCandidatesAndFeatures: vi.fn(),
  mockGetPersonalizationMetricsConfig: vi.fn(),
  mockAssignPersonalizationAbGroup: vi.fn(),
  mockEnqueuePersonalizationRequestMetric: vi.fn(),
  mockGetPersonalizationImpactSummary: vi.fn(),
  mockRunAllModels: vi.fn(),
  mockSelectBudgetTickets: vi.fn(),
}));

vi.mock("./db", () => ({
  getDrawResults: mockGetDrawResults,
  insertDrawResult: vi.fn(),
  getLatestDrawResults: vi.fn(),
  getAllDrawResults: vi.fn(),
  getDrawResultCount: vi.fn(),
  insertPredictions: mockInsertPredictions,
  getUserPredictions: vi.fn(),
  getRecentPredictions: vi.fn(),
  insertTicketSelection: vi.fn(),
  getUserTicketSelections: vi.fn(),
  getModelPerformanceStats: vi.fn(),
  getModelWeights: mockGetModelWeights,
  evaluatePredictionsAgainstDraw: vi.fn(),
  addFavorite: vi.fn(),
  getUserFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  incrementFavoriteUsage: vi.fn(),
  upsertPushSubscription: vi.fn(),
  getUserPushSubscription: vi.fn(),
  updatePushPreferences: vi.fn(),
  getUserPdfUploads: vi.fn(),
  insertPurchasedTicket: vi.fn(),
  getUserPurchasedTickets: vi.fn(),
  updatePurchasedTicketOutcome: vi.fn(),
  deletePurchasedTicket: vi.fn(),
  getUserROIStats: vi.fn().mockResolvedValue({
    totalSpent: 0, totalWon: 0, totalTickets: 0, wins: 0, losses: 0, pending: 0, roi: 0,
  }),
  getROIByGame: vi.fn().mockResolvedValue([]),
  getModelTrends: vi.fn().mockResolvedValue([]),
  getTicketAnalytics: vi.fn().mockResolvedValue({
    modelsPlayedMost: [],
    modelsWonMoney: [],
    hitRateByModel: [],
    middayVsEvening: { midday: 0, evening: 0 },
  }),
}));

vi.mock("./ranker-v2-db", () => ({
  createPredictionCandidateBatch: mockCreatePredictionCandidateBatch,
  getModelAverageHitsMap: mockGetModelAverageHitsMap,
  getOrCreateActiveRankerVersion: mockGetOrCreateActiveRankerVersion,
  getPredictionCandidateBatchesByUser: vi.fn().mockResolvedValue([]),
  getRankerVersionsByGame: vi.fn().mockResolvedValue([]),
  getRankerTrainingSourceBreakdown: vi.fn().mockResolvedValue({
    generatedCandidateCount: 0,
    scannedTicketCount: 0,
    pendingScannedTicketCount: 0,
    promotedScannedTicketCount: 0,
  }),
  recordCandidateOutcomesAndTrainRanker: vi.fn().mockResolvedValue({
    candidateOutcomes: 0,
    trainedExamples: 0,
    newRankerVersionId: null,
  }),
  storePredictionCandidatesAndFeatures: mockStorePredictionCandidatesAndFeatures,
}));

vi.mock("./personal-ranker-db", () => ({
  getActivePersonalRankerVersion: mockGetActivePersonalRankerVersion,
  getPersonalizationConfig: mockGetPersonalizationConfig,
  getPersonalRankerStatus: mockGetPersonalRankerStatus,
  getPersonalTrainingSourceBreakdown: mockGetPersonalTrainingSourceBreakdown,
  evaluatePromotionEligibility: mockEvaluatePromotionEligibility,
}));

vi.mock("./scanned-ticket-learning", () => ({
  computeScannedTicketFeatureSnapshot: vi.fn().mockResolvedValue({}),
  evaluateConfirmedScannedTicketsForDraw: vi.fn().mockResolvedValue({ evaluatedCount: 0, newOutcomes: 0 }),
}));

vi.mock("./predictions", () => ({
  runAllModels: mockRunAllModels,
  selectBudgetTickets: mockSelectBudgetTickets,
  applySumRangeFilter: (predictions: any[]) => predictions,
}));

vi.mock("./personalization-metrics", () => ({
  getPersonalizationMetricsConfig: mockGetPersonalizationMetricsConfig,
  assignPersonalizationAbGroup: mockAssignPersonalizationAbGroup,
  snapshotTopCandidates: (ranked: any[], topN: number) =>
    ranked.slice(0, topN).map((candidate, idx) => ({
      candidateKey: candidate.candidateKey,
      rankPosition: Number(candidate.rankPosition || idx + 1),
      probability: Number(candidate.rankerProbability || 0),
    })),
  resolveSelectedCandidateSource: ({ personalizationApplied }: { personalizationApplied: boolean }) =>
    personalizationApplied ? "personal_reranker_adjustment" : "global_ranking",
  enqueuePersonalizationRequestMetric: mockEnqueuePersonalizationRequestMetric,
  getPersonalizationImpactSummary: mockGetPersonalizationImpactSummary,
}));

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("./_core/systemRouter", () => ({ systemRouter: {} }));
vi.mock("./cron", () => ({
  getLastAutoFetchResult: vi.fn(),
  isAutoFetchActive: vi.fn(),
  getAutoFetchRunning: vi.fn(),
  runAutoFetch: vi.fn(),
}));
vi.mock("./lib/fl-lottery-scraper", () => ({ fetchHistoricalDraws: vi.fn() }));
vi.mock("./lib/lotteryusa-scraper", () => ({
  fetchRecentDraws: vi.fn(),
  fetchAllGamesRecent: vi.fn(),
}));

import { appRouter } from "./routers";

describe("prediction ranker V2 flow through routers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDrawResults.mockResolvedValue([
      { mainNumbers: [1, 2, 3, 4, 5], specialNumbers: [], drawDate: Date.now() - 86400000 },
    ]);
    mockGetModelWeights.mockResolvedValue({ frequency_baseline: 0.8, ai_oracle: 0.9 });
    mockGetModelAverageHitsMap.mockResolvedValue({ frequency_baseline: 1.6, ai_oracle: 2.2 });
    mockGetOrCreateActiveRankerVersion.mockResolvedValue({
      id: 51,
      gameType: "fantasy_5",
      algorithm: "online_logistic_regression",
      featureSetVersion: "ranker_v2_structured_2026_03",
      intercept: -0.2,
      coefficients: {
        base_confidence: 1,
        top_freq_overlap: 0.4,
        consensus_overlap: 0.4,
        insufficient_penalty: -1,
      },
      learningRate: 0.05,
      l2Lambda: 0.001,
      trainedExamples: 100,
    });
    mockGetActivePersonalRankerVersion.mockResolvedValue(null);
    mockGetPersonalizationConfig.mockReturnValue({
      minExamplesToApply: 8,
      rampExamples: 40,
      maxBlendWeight: 0.35,
      maxPerCandidateDelta: 0.2,
      retrainBatchMinExamples: 1,
      promotionEnabled: false,
      promotionMinOutcomes: 250,
      promotionMinUsers: 20,
      promotionMaxPerUser: 25,
      promotionLookbackDays: 90,
    });
    mockGetPersonalRankerStatus.mockResolvedValue({
      userId: 7,
      gameType: "fantasy_5",
      activeVersionId: null,
      hasPersonalRanker: false,
      eligible: false,
      trainedExamples: 0,
      minExamplesToApply: 8,
      blend: {
        rampExamples: 40,
        maxBlendWeight: 0.35,
        maxPerCandidateDelta: 0.2,
      },
      breakdown: {
        userId: 7,
        gameType: "fantasy_5",
        pendingScannedExamples: 0,
        consumedScannedExamples: 0,
        latestActiveVersionId: null,
        latestActiveTrainedExamples: 0,
        latestActiveScannedExamples: 0,
        latestActivePromotedExamples: 0,
      },
    });
    mockGetPersonalTrainingSourceBreakdown.mockResolvedValue({
      userId: 7,
      gameType: "fantasy_5",
      pendingScannedExamples: 0,
      consumedScannedExamples: 0,
      latestActiveVersionId: null,
      latestActiveTrainedExamples: 0,
      latestActiveScannedExamples: 0,
      latestActivePromotedExamples: 0,
    });
    mockEvaluatePromotionEligibility.mockResolvedValue({
      promotionEnabled: false,
      eligible: false,
      blockedReasons: ["promotion_disabled"],
      minOutcomes: 250,
      minUsers: 20,
      maxPromotedPerUser: 25,
      recentOutcomes: 0,
      distinctUsers: 0,
      promotedExamples: 0,
    });

    const basePreds = [
      {
        modelName: "frequency_baseline",
        mainNumbers: [1, 2, 3, 4, 5],
        specialNumbers: [],
        confidenceScore: 0.3,
        metadata: { strategy: "baseline" },
      },
      {
        modelName: "ai_oracle",
        mainNumbers: [1, 2, 3, 4, 6],
        specialNumbers: [],
        confidenceScore: 0.7,
        metadata: { strategy: "ensemble" },
      },
    ];
    mockRunAllModels.mockReturnValue(basePreds);
    mockCreatePredictionCandidateBatch.mockResolvedValue(9001);
    mockStorePredictionCandidatesAndFeatures.mockResolvedValue([
      { candidateId: 1001, features: { base_confidence: 0.3 } },
      { candidateId: 1002, features: { base_confidence: 0.7 } },
    ]);
    mockGetPersonalizationMetricsConfig.mockReturnValue({
      topN: 10,
      abControlPercent: 0,
      hashSalt: "test-salt",
      impactLookbackDays: 90,
    });
    mockAssignPersonalizationAbGroup.mockReturnValue({
      group: "treatment",
      bucket: 50,
      personalizationAllowed: true,
    });
    mockGetPersonalizationImpactSummary.mockResolvedValue({
      sampleSize: 12,
      avgLift: 1.1,
      percentImprovement: 9.5,
      hitRateAt5: { baseline: 0.22, personalized: 0.24, improvementPercent: 9.1 },
      hitRateAt10: { baseline: 0.31, personalized: 0.34, improvementPercent: 9.7 },
      precisionAt5: { baseline: 0.08, personalized: 0.1, avgLift: 0.02 },
      precisionAt10: { baseline: 0.05, personalized: 0.06, avgLift: 0.01 },
      ab: {
        controlSampleSize: 5,
        treatmentSampleSize: 7,
        treatmentVsControlHitRateImprovementAt5Percent: 11.3,
      },
    });
    mockInsertPredictions.mockResolvedValue(undefined);
    mockSelectBudgetTickets.mockReturnValue({
      tickets: [
        { mainNumbers: [1, 2, 3, 4, 6], specialNumbers: [], modelSource: "ai_oracle", confidence: 0.8 },
      ],
      totalCost: FLORIDA_GAMES.fantasy_5.ticketPrice,
    });
  });

  it("predictions.generate returns ranker metadata and persists ranked candidates", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 7,
        openId: "u7",
        email: null,
        name: "Tester",
        role: "user",
        loginMethod: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      res: { clearCookie: () => {} } as any,
      req: {} as any,
    } as any);

    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    expect(result.rankerV2.enabled).toBe(true);
    expect(result.rankerV2.rankerVersionId).toBe(51);
    expect(result.rankerV2.candidateBatchId).toBe(9001);
    expect(result.rankerV2.personalization.applied).toBe(false);
    expect(result.predictions.length).toBe(2);
    expect(result.predictions[0].metadata).toHaveProperty("ranker");

    expect(mockCreatePredictionCandidateBatch).toHaveBeenCalledTimes(1);
    expect(mockStorePredictionCandidatesAndFeatures).toHaveBeenCalledTimes(1);
    expect(mockInsertPredictions).toHaveBeenCalledTimes(1);
    expect(mockEnqueuePersonalizationRequestMetric).toHaveBeenCalledTimes(1);
    const metricPayload = mockEnqueuePersonalizationRequestMetric.mock.calls[0][0];
    expect(metricPayload).toMatchObject({
      gameType: "fantasy_5",
      requestSource: "predictions.generate",
      candidateBatchId: 9001,
      personalizationApplied: false,
      abGroup: "treatment",
      abBucket: 50,
    });
    expect(Array.isArray(metricPayload.topGlobalCandidates)).toBe(true);
    expect(Array.isArray(metricPayload.topServedCandidates)).toBe(true);
  });

  it("tickets.generate uses ranked predictions and includes ranker metadata", async () => {
    const caller = appRouter.createCaller({
      user: null,
      res: { clearCookie: () => {} } as any,
      req: {} as any,
    } as any);

    const result = await caller.tickets.generate({
      gameType: "fantasy_5",
      budget: 10,
      maxTickets: 5,
    });

    expect(mockSelectBudgetTickets).toHaveBeenCalledTimes(1);
    expect(result.rankerV2.enabled).toBe(true);
    expect(result.rankerV2.rankerVersionId).toBe(51);
    expect(result.rankerV2.personalization.applied).toBe(false);
    expect(result.tickets.length).toBe(1);
  });

  it("applies personalization only for requesting user", async () => {
    mockGetActivePersonalRankerVersion.mockImplementation(async (userId: number) => {
      if (userId === 7) {
        return {
          id: 900,
          gameType: "fantasy_5",
          algorithm: "online_logistic_regression_personal",
          featureSetVersion: "ranker_v2_structured_2026_03",
          intercept: 2,
          coefficients: {
            base_confidence: -2,
            top_freq_overlap: 0,
            consensus_overlap: 0,
          },
          learningRate: 0.04,
          l2Lambda: 0.002,
          trainedExamples: 50,
        };
      }
      return null;
    });

    const callerA = appRouter.createCaller({
      user: {
        id: 7,
        openId: "u7",
        email: null,
        name: "User A",
        role: "user",
        loginMethod: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      res: { clearCookie: () => {} } as any,
      req: {} as any,
    } as any);
    const callerB = appRouter.createCaller({
      user: {
        id: 8,
        openId: "u8",
        email: null,
        name: "User B",
        role: "user",
        loginMethod: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      res: { clearCookie: () => {} } as any,
      req: {} as any,
    } as any);

    const resultA = await callerA.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });
    const resultB = await callerB.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    expect(resultA.rankerV2.personalization.applied).toBe(true);
    expect(resultA.rankerV2.personalization.personalRankerVersionId).toBe(900);
    expect(resultA.rankerV2.personalization.adjustedCandidates).toBeGreaterThan(0);

    expect(resultB.rankerV2.personalization.applied).toBe(false);
    expect(resultB.rankerV2.personalization.personalRankerVersionId).toBeNull();
  });

  it("forces control bucket to disable personalization while keeping eligibility metadata", async () => {
    mockAssignPersonalizationAbGroup.mockReturnValueOnce({
      group: "control",
      bucket: 9,
      personalizationAllowed: false,
    });
    mockGetActivePersonalRankerVersion.mockResolvedValueOnce({
      id: 901,
      gameType: "fantasy_5",
      algorithm: "online_logistic_regression_personal",
      featureSetVersion: "ranker_v2_structured_2026_03",
      intercept: 1.5,
      coefficients: { base_confidence: -1.5 },
      learningRate: 0.04,
      l2Lambda: 0.002,
      trainedExamples: 80,
    });

    const caller = appRouter.createCaller({
      user: {
        id: 7,
        openId: "u7",
        email: null,
        name: "Tester",
        role: "user",
        loginMethod: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      res: { clearCookie: () => {} } as any,
      req: {} as any,
    } as any);

    const result = await caller.predictions.generate({
      gameType: "fantasy_5",
      sumRangeFilter: false,
    });

    expect(result.rankerV2.personalization.applied).toBe(false);
    expect(result.rankerV2.personalization.eligible).toBe(true);
    expect(result.rankerV2.personalization.abGroup).toBe("control");
    expect(result.rankerV2.personalization.blockedReason).toBe("ab_control");
  });

  it("returns aggregated personalization impact metrics", async () => {
    const caller = appRouter.createCaller({
      user: null,
      res: { clearCookie: () => {} } as any,
      req: {} as any,
    } as any);

    const result = await caller.metrics.personalizationImpact({
      gameType: "fantasy_5",
      lookbackDays: 30,
    });

    expect(mockGetPersonalizationImpactSummary).toHaveBeenCalledWith({
      gameType: "fantasy_5",
      lookbackDays: 30,
    });
    expect(result.sampleSize).toBe(12);
    expect(result.avgLift).toBe(1.1);
    expect(result.ab.treatmentSampleSize).toBe(7);
  });
});
