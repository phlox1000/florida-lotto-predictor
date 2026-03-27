import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLORIDA_GAMES } from "../shared/lottery";

const {
  mockGetDrawResults,
  mockGetModelWeights,
  mockGetModelAverageHitsMap,
  mockGetOrCreateActiveRankerVersion,
  mockInsertPredictions,
  mockCreatePredictionCandidateBatch,
  mockStorePredictionCandidatesAndFeatures,
  mockRunAllModels,
  mockSelectBudgetTickets,
} = vi.hoisted(() => ({
  mockGetDrawResults: vi.fn(),
  mockGetModelWeights: vi.fn(),
  mockGetModelAverageHitsMap: vi.fn(),
  mockGetOrCreateActiveRankerVersion: vi.fn(),
  mockInsertPredictions: vi.fn(),
  mockCreatePredictionCandidateBatch: vi.fn(),
  mockStorePredictionCandidatesAndFeatures: vi.fn(),
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
  storePredictionCandidatesAndFeatures: mockStorePredictionCandidatesAndFeatures,
}));

vi.mock("./predictions", () => ({
  runAllModels: mockRunAllModels,
  selectBudgetTickets: mockSelectBudgetTickets,
  applySumRangeFilter: (predictions: any[]) => predictions,
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
    expect(result.predictions.length).toBe(2);
    expect(result.predictions[0].metadata).toHaveProperty("ranker");

    expect(mockCreatePredictionCandidateBatch).toHaveBeenCalledTimes(1);
    expect(mockStorePredictionCandidatesAndFeatures).toHaveBeenCalledTimes(1);
    expect(mockInsertPredictions).toHaveBeenCalledTimes(1);
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
    expect(result.tickets.length).toBe(1);
  });
});
