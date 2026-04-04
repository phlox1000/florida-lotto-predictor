import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockInsertDrawResult,
  mockUpdatePdfUploadStatus,
  mockPdfParse,
  mockRecordAiObservability,
} = vi.hoisted(() => ({
  mockInsertDrawResult: vi.fn(),
  mockUpdatePdfUploadStatus: vi.fn(),
  mockPdfParse: vi.fn(),
  mockRecordAiObservability: vi.fn(),
}));

vi.mock("./db", () => ({
  insertPdfUpload: vi.fn(),
  updatePdfUploadStatus: mockUpdatePdfUploadStatus,
  insertDrawResult: mockInsertDrawResult,
  insertPurchasedTicket: vi.fn(),
  getUserPredictionsByGame: vi.fn(),
  getDrawResultByGameDateTime: vi.fn(),
  evaluatePurchasedTicketsAgainstDraw: vi.fn(),
  getDatabaseSchemaSanity: vi.fn().mockResolvedValue({
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
  }),
}));

const { mockPdfParseDestroy } = vi.hoisted(() => ({
  mockPdfParseDestroy: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  default: mockPdfParse,
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: mockPdfParse,
    destroy: mockPdfParseDestroy,
  })),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/ai-observability", () => ({
  recordAiObservability: mockRecordAiObservability,
  safeShortErrorCode: vi.fn((value: unknown) => String(value || "unknown_error")),
  getRecentAiObservability: vi.fn().mockReturnValue([]),
}));

vi.mock("./_core/context", () => ({
  createContext: vi.fn(),
}));

import { processPdfWithLLM } from "./upload";

describe("processPdfWithLLM duplicate handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPdfParseDestroy.mockResolvedValue(undefined);
    mockPdfParse.mockResolvedValue({
      text: "01/02/2024\nEVENING\n1\n2\n3\n4\n5\n",
    });
  });

  it("counts first upload as inserted and second as skipped duplicate", async () => {
    mockInsertDrawResult
      .mockResolvedValueOnce({ status: "inserted", insertId: 101 })
      .mockResolvedValueOnce({ status: "duplicate", insertId: 0 });

    const rawPdf = Buffer.from("fake pdf payload");
    const prefixedBase64 = `data:application/pdf;base64,${rawPdf.toString("base64")}`;

    await processPdfWithLLM(1, "https://example.com/a.pdf", prefixedBase64, "fantasy_5");
    await processPdfWithLLM(2, "https://example.com/a.pdf", prefixedBase64, "fantasy_5");

    expect(mockInsertDrawResult).toHaveBeenCalledTimes(2);
    expect(mockPdfParse).toHaveBeenCalledTimes(2);
    expect(mockPdfParse.mock.calls[0][0]).toEqual(rawPdf);

    expect(mockUpdatePdfUploadStatus).toHaveBeenNthCalledWith(
      1,
      1,
      "completed",
      { drawsExtracted: 1, errorMessage: null },
    );
    expect(mockUpdatePdfUploadStatus).toHaveBeenNthCalledWith(
      2,
      2,
      "completed",
      { drawsExtracted: 0, errorMessage: "1 draws skipped (duplicates or invalid)" },
    );
    expect(mockRecordAiObservability).toHaveBeenCalledTimes(2);
    expect(mockRecordAiObservability).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        feature: "upload-pdf-ocr",
        providerSucceeded: true,
      })
    );
  });
});
