import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

const { mockInsertPurchasedTicket, mockGetDatabaseSchemaSanity } = vi.hoisted(() => ({
  mockInsertPurchasedTicket: vi.fn().mockResolvedValue(12345),
  mockGetDatabaseSchemaSanity: vi.fn(),
}));

vi.mock("./db", () => ({
  getDatabaseSchemaSanity: mockGetDatabaseSchemaSanity,
  insertPurchasedTicket: mockInsertPurchasedTicket,
  getDrawResults: vi.fn().mockResolvedValue([]),
  insertDrawResult: vi.fn(),
  getLatestDrawResults: vi.fn(),
  getAllDrawResults: vi.fn(),
  getDrawResultCount: vi.fn().mockResolvedValue(0),
  insertPredictions: vi.fn(),
  getUserPredictions: vi.fn().mockResolvedValue([]),
  getRecentPredictions: vi.fn().mockResolvedValue([]),
  insertTicketSelection: vi.fn(),
  getUserTicketSelections: vi.fn().mockResolvedValue([]),
  getModelPerformanceStats: vi.fn().mockResolvedValue([]),
  getModelWeights: vi.fn().mockResolvedValue({}),
  evaluatePredictionsAgainstDraw: vi.fn(),
  addFavorite: vi.fn(),
  getUserFavorites: vi.fn().mockResolvedValue([]),
  removeFavorite: vi.fn(),
  incrementFavoriteUsage: vi.fn(),
  upsertPushSubscription: vi.fn(),
  getUserPushSubscription: vi.fn(),
  updatePushPreferences: vi.fn(),
  getUserPdfUploads: vi.fn().mockResolvedValue([]),
  getUserScannedTickets: vi.fn().mockResolvedValue([]),
  getScannedTicketForUser: vi.fn().mockResolvedValue(null),
  insertScannedTicketFeatureSnapshots: vi.fn(),
  getDrawResultByGameDateTime: vi.fn().mockResolvedValue(null),
  evaluatePurchasedTicketsAgainstDraw: vi.fn(),
  claimScannedTicketForConfirmation: vi.fn(),
  findDuplicateConfirmedScannedRow: vi.fn().mockResolvedValue(null),
  updateScannedTicketStatus: vi.fn(),
  updateScannedTicketRowConfirmation: vi.fn(),
  getUserPurchasedTickets: vi.fn().mockResolvedValue([]),
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

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("./_core/systemRouter", () => ({ systemRouter: {} }));
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

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx };
}

describe("tracker.logPurchase", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logPurchase({
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        purchaseDate: Date.now(),
        cost: 1,
      })
    ).rejects.toThrow();
  });

  it("validates input schema - requires gameType", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logPurchase({
        gameType: "invalid_game" as any,
        mainNumbers: [1, 2, 3, 4, 5],
        purchaseDate: Date.now(),
        cost: 1,
      })
    ).rejects.toThrow();
  });

  it("validates cost must be non-negative", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logPurchase({
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        purchaseDate: Date.now(),
        cost: -5,
      })
    ).rejects.toThrow();
  });

  it("calls insertPurchasedTicket and returns persisted id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const purchaseDate = Date.now();
    const result = await caller.tracker.logPurchase({
      gameType: "fantasy_5",
      mainNumbers: [1, 2, 3, 4, 5],
      purchaseDate,
      cost: 2,
      modelSource: "frequency_baseline",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe(12345);
    expect(mockInsertPurchasedTicket).toHaveBeenCalledTimes(1);
    expect(mockInsertPurchasedTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        gameType: "fantasy_5",
        mainNumbers: [1, 2, 3, 4, 5],
        cost: 2,
      })
    );
  });
});

describe("tracker.logBulkPurchase", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logBulkPurchase({
        tickets: [
          { gameType: "fantasy_5", mainNumbers: [1, 2, 3, 4, 5], cost: 1 },
        ],
        purchaseDate: Date.now(),
      })
    ).rejects.toThrow();
  });

  it("validates ticket array schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.logBulkPurchase({
        tickets: [
          { gameType: "invalid" as any, mainNumbers: [1], cost: 1 },
        ],
        purchaseDate: Date.now(),
      })
    ).rejects.toThrow();
  });
});

describe("tracker.updateOutcome", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.updateOutcome({ id: 1, outcome: "win", winAmount: 100 })
    ).rejects.toThrow();
  });

  it("validates outcome enum", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.updateOutcome({ id: 1, outcome: "invalid" as any })
    ).rejects.toThrow();
  });
});

describe("tracker.delete", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tracker.delete({ id: 1 })
    ).rejects.toThrow();
  });
});

describe("tracker.stats", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tracker.stats()).rejects.toThrow();
  });
});

describe("tracker.statsByGame", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tracker.statsByGame()).rejects.toThrow();
  });
});

describe("dataFetch.pdfUploads", () => {
  it("requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dataFetch.pdfUploads()).rejects.toThrow();
  });
});
