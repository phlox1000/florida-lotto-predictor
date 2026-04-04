import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockInvokeLLM,
  mockRecordAiObservability,
  mockSafeShortErrorCode,
  mockGetDatabaseSchemaSanity,
} = vi.hoisted(() => ({
  mockInvokeLLM: vi.fn(),
  mockRecordAiObservability: vi.fn(),
  mockSafeShortErrorCode: vi.fn().mockReturnValue("analysis_llm_failed"),
  mockGetDatabaseSchemaSanity: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: mockInvokeLLM,
}));

vi.mock("./_core/ai-observability", () => ({
  recordAiObservability: mockRecordAiObservability,
  safeShortErrorCode: mockSafeShortErrorCode,
  getRecentAiObservability: vi.fn().mockReturnValue([]),
}));

vi.mock("./db", () => ({
  getDrawResults: vi.fn().mockResolvedValue([
    {
      id: 1,
      gameType: "fantasy_5",
      drawDate: Date.now(),
      mainNumbers: [1, 2, 3, 4, 5],
      specialNumbers: [],
      drawTime: "evening",
      source: "manual",
      createdAt: new Date(),
    },
  ]),
  getModelPerformanceStats: vi.fn().mockResolvedValue([
    {
      modelName: "frequency_baseline",
      totalPredictions: 10,
      avgMainHits: 1.5,
      avgSpecialHits: 0,
      maxMainHits: 3,
    },
  ]),
  getModelWeights: vi.fn().mockResolvedValue({
    frequency_baseline: 0.75,
  }),
  getDatabaseSchemaSanity: mockGetDatabaseSchemaSanity,
  getLatestDrawResults: vi.fn(),
  getAllDrawResults: vi.fn(),
  getDrawResultCount: vi.fn(),
  insertDrawResult: vi.fn(),
  insertPredictions: vi.fn(),
  getUserPredictions: vi.fn(),
  getRecentPredictions: vi.fn(),
  insertTicketSelection: vi.fn(),
  getUserTicketSelections: vi.fn(),
  evaluatePredictionsAgainstDraw: vi.fn(),
  addFavorite: vi.fn(),
  getUserFavorites: vi.fn(),
  removeFavorite: vi.fn(),
  incrementFavoriteUsage: vi.fn(),
  upsertPushSubscription: vi.fn(),
  getUserPushSubscription: vi.fn(),
  updatePushPreferences: vi.fn(),
  getUserPdfUploads: vi.fn(),
  getUserScannedTickets: vi.fn(),
  getScannedTicketForUser: vi.fn(),
  insertScannedTicketFeatureSnapshots: vi.fn(),
  getDrawResultByGameDateTime: vi.fn(),
  evaluatePurchasedTicketsAgainstDraw: vi.fn(),
  claimScannedTicketForConfirmation: vi.fn(),
  findDuplicateConfirmedScannedRow: vi.fn(),
  updateScannedTicketStatus: vi.fn(),
  updateScannedTicketRowConfirmation: vi.fn(),
  insertPurchasedTicket: vi.fn(),
  getUserPurchasedTickets: vi.fn(),
  updatePurchasedTicketOutcome: vi.fn(),
  deletePurchasedTicket: vi.fn(),
  getUserROIStats: vi.fn().mockResolvedValue({
    totalSpent: 0,
    totalWon: 0,
    totalTickets: 0,
    wins: 0,
    losses: 0,
    pending: 0,
    roi: 0,
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

vi.mock("./predictions", () => ({
  runAllModels: vi.fn().mockReturnValue([]),
  selectBudgetTickets: vi.fn().mockReturnValue({ tickets: [], totalCost: 0 }),
  applySumRangeFilter: (predictions: any[]) => predictions,
}));

vi.mock("./ranker-v2", () => ({
  computeCandidateFeatures: vi.fn().mockReturnValue([]),
  applyPersonalizedReranking: vi.fn().mockReturnValue({
    applied: false,
    personalRankerVersionId: null,
    blendWeight: 0,
    adjustedCandidates: 0,
  }),
  diversifyRankedCandidates: vi.fn(),
  mergeRankedCandidatesIntoPredictions: (predictions: any[]) => predictions,
  rankCandidates: vi.fn().mockReturnValue([]),
}));

vi.mock("./ranker-v2-db", () => ({
  createPredictionCandidateBatch: vi.fn().mockResolvedValue(1),
  getModelAverageHitsMap: vi.fn().mockResolvedValue({}),
  getOrCreateActiveRankerVersion: vi.fn().mockResolvedValue({
    id: 1,
    gameType: "fantasy_5",
    algorithm: "online_logistic_regression",
    featureSetVersion: "ranker_v2_structured_2026_03",
    intercept: 0,
    coefficients: {},
    learningRate: 0.05,
    l2Lambda: 0.001,
    trainedExamples: 0,
  }),
  getPredictionCandidateBatchesByUser: vi.fn().mockResolvedValue([]),
  getRankerTrainingSourceBreakdown: vi.fn().mockResolvedValue({
    generatedCandidateCount: 0,
    scannedTicketCount: 0,
    pendingScannedTicketCount: 0,
    promotedScannedTicketCount: 0,
  }),
  getRankerVersionsByGame: vi.fn().mockResolvedValue([]),
  recordCandidateOutcomesAndTrainRanker: vi.fn().mockResolvedValue({
    candidateOutcomes: 0,
    trainedExamples: 0,
    newRankerVersionId: null,
  }),
  storePredictionCandidatesAndFeatures: vi.fn().mockResolvedValue([]),
}));

vi.mock("./personal-ranker-db", () => ({
  evaluatePromotionEligibility: vi.fn().mockResolvedValue({
    promotionEnabled: false,
    eligible: false,
    blockedReasons: [],
    minOutcomes: 0,
    minUsers: 0,
    maxPromotedPerUser: 0,
    recentOutcomes: 0,
    distinctUsers: 0,
    promotedExamples: 0,
  }),
  getActivePersonalRankerVersion: vi.fn().mockResolvedValue(null),
  getPersonalizationConfig: vi.fn().mockReturnValue({
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
  }),
  getPersonalRankerStatus: vi.fn().mockResolvedValue(null),
  getPersonalTrainingSourceBreakdown: vi.fn().mockResolvedValue(null),
}));

vi.mock("./personalization-metrics", () => ({
  assignPersonalizationAbGroup: vi.fn().mockReturnValue({
    group: "ineligible",
    bucket: null,
    personalizationAllowed: false,
  }),
  enqueuePersonalizationRequestMetric: vi.fn(),
  getPersonalizationImpactSummary: vi.fn().mockResolvedValue({ sampleSize: 0 }),
  getPersonalizationMetricsConfig: vi.fn().mockReturnValue({
    topN: 10,
    abControlPercent: 0,
    hashSalt: "test",
    impactLookbackDays: 90,
  }),
  resolveSelectedCandidateSource: vi.fn().mockReturnValue("global_ranking"),
  snapshotTopCandidates: vi.fn().mockReturnValue([]),
}));

vi.mock("./_core/systemRouter", () => ({ systemRouter: {} }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("./cron", () => ({
  getLastAutoFetchResult: vi.fn().mockReturnValue(null),
  isAutoFetchActive: vi.fn().mockReturnValue(false),
  getAutoFetchRunning: vi.fn().mockReturnValue(false),
  runAutoFetch: vi.fn(),
}));
vi.mock("./lib/fl-lottery-scraper", () => ({ fetchHistoricalDraws: vi.fn() }));
vi.mock("./lib/lotteryusa-scraper", () => ({
  fetchRecentDraws: vi.fn(),
  fetchAllGamesRecent: vi.fn(),
}));
vi.mock("./scanned-ticket-learning", () => ({
  computeScannedTicketFeatureSnapshot: vi.fn(),
  evaluateConfirmedScannedTicketsForDraw: vi.fn().mockResolvedValue({
    evaluatedCount: 0,
    newOutcomes: 0,
  }),
}));

import { appRouter } from "./routers";

describe("analysis.generate observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatabaseSchemaSanity.mockResolvedValue({
      checked: true,
      checkedAt: new Date().toISOString(),
      requiredTables: [],
      missingTables: [],
      lastError: null,
      personalizationMetricsAvailable: true,
      personalizationFeaturesActive: true,
      bootstrap: {
        attempted: false,
        applied: false,
        error: null,
        mode: "disabled",
        migrationPreferred: true,
      },
    });
  });

  it("returns provider metadata on success", async () => {
    mockInvokeLLM.mockResolvedValue({
      id: "resp-1",
      created: Date.now(),
      model: "gemini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "analysis text" },
          finish_reason: "stop",
        },
      ],
    });
    const caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: { clearCookie: () => {} } as any,
    } as any);

    const result = await caller.analysis.generate({
      gameType: "fantasy_5",
      analysisType: "model_performance",
    });

    expect(result.analysis).toContain("analysis text");
    expect(result.aiObservability.providerAttempted).toBe("invokeLLM");
    expect(result.aiObservability.providerSucceeded).toBe(true);
    expect(result.aiObservability.fallbackUsed).toBe(false);
    expect(mockRecordAiObservability).toHaveBeenCalledTimes(1);
  });

  it("returns fallback message and metadata on provider failure", async () => {
    mockInvokeLLM.mockRejectedValue(new Error("provider down"));
    const caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: { clearCookie: () => {} } as any,
    } as any);

    const result = await caller.analysis.generate({
      gameType: "fantasy_5",
      analysisType: "pattern_analysis",
    });

    expect(result.analysis).toContain("fallback response");
    expect(result.aiObservability.providerSucceeded).toBe(false);
    expect(result.aiObservability.fallbackUsed).toBe(true);
    expect(result.aiObservability.errorCode).toBe("analysis_llm_failed");
    expect(mockSafeShortErrorCode).toHaveBeenCalled();
    expect(mockRecordAiObservability).toHaveBeenCalledTimes(1);
  });
});
