import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockResponsesCreate,
  mockOpenAIConstructor,
} = vi.hoisted(() => {
  const responsesCreate = vi.fn();
  const ctor = vi.fn().mockImplementation(() => ({
    responses: {
      create: responsesCreate,
    },
  }));
  return {
    mockResponsesCreate: responsesCreate,
    mockOpenAIConstructor: ctor,
  };
});

vi.mock("openai", () => ({
  default: mockOpenAIConstructor,
}));

describe("openai-ocr module", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws clear error when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const mod = await import("./_core/openai-ocr");

    await expect(
      mod.extractTicketFromImageWithOpenAI({
        imageUrl: "https://example.com/ticket.png",
        gameTypeListHint: "fantasy_5: Fantasy 5",
      })
    ).rejects.toThrow(/OPENAI_API_KEY is not configured/i);
  });

  it("calls responses.create and parses ticket extraction JSON", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_OCR_MODEL", "gpt-4.1-mini");
    mockResponsesCreate.mockResolvedValue({
      id: "resp_test_ticket_1",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                gameType: "fantasy_5",
                drawDate: "2030-01-05",
                drawTime: "evening",
                mainNumbers: [1, 2, 3, 4, 5],
                specialNumbers: [],
              }),
            },
          ],
        },
      ],
    });

    const mod = await import("./_core/openai-ocr");
    const result = await mod.extractTicketFromImageWithOpenAI({
      imageUrl: "https://example.com/ticket.png",
      gameTypeListHint: "fantasy_5: Fantasy 5",
    });

    expect(mockOpenAIConstructor).toHaveBeenCalled();
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      gameType: "fantasy_5",
      drawDate: "2030-01-05",
      drawTime: "evening",
      mainNumbers: [1, 2, 3, 4, 5],
      specialNumbers: [],
    });
    expect(mockResponsesCreate.mock.calls[0]?.[0]?.model).toBe("gpt-4.1-mini");
  });

  it("fails safely when OpenAI returns malformed JSON", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockResponsesCreate.mockResolvedValue({
      id: "resp_test_ticket_bad_json",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: "{ this is not valid json",
            },
          ],
        },
      ],
    });

    const mod = await import("./_core/openai-ocr");
    await expect(
      mod.extractTicketFromImageWithOpenAI({
        imageUrl: "https://example.com/ticket.png",
        gameTypeListHint: "fantasy_5: Fantasy 5",
      })
    ).rejects.toThrow();
  });

  it("does not fallback when mini output is valid", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_OCR_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_OCR_FALLBACK_MODEL", "gpt-4.1");
    mockResponsesCreate.mockResolvedValue({
      id: "resp_ticket_valid_primary",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                gameType: "pick_3",
                drawDate: "2030-01-05",
                drawTime: "midday",
                mainNumbers: [1, 2, 3],
                specialNumbers: [],
              }),
            },
          ],
        },
      ],
    });

    const mod = await import("./_core/openai-ocr");
    const result = await mod.extractTicketFromImageWithOpenAI({
      imageUrl: "https://example.com/ticket.png",
      gameTypeListHint: "pick_3: Pick 3",
    });

    expect(result.gameType).toBe("pick_3");
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    expect(mockResponsesCreate.mock.calls[0]?.[0]?.model).toBe("gpt-4.1-mini");
  });

  it("falls back to gpt-4.1 when primary ticket output is invalid", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_OCR_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_OCR_FALLBACK_MODEL", "gpt-4.1");
    mockResponsesCreate
      .mockResolvedValueOnce({
        id: "resp_ticket_invalid_primary",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  gameType: "fantasy_5",
                  drawDate: "2030-01-05",
                  drawTime: "evening",
                  // invalid count for Fantasy 5, should trigger fallback
                  mainNumbers: [1, 2, 3],
                  specialNumbers: [],
                }),
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "resp_ticket_valid_fallback",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  gameType: "fantasy_5",
                  drawDate: "2030-01-05",
                  drawTime: "evening",
                  mainNumbers: [1, 2, 3, 4, 5],
                  specialNumbers: [],
                }),
              },
            ],
          },
        ],
      });

    const mod = await import("./_core/openai-ocr");
    const result = await mod.extractTicketFromImageWithOpenAI({
      imageUrl: "https://example.com/ticket.png",
      gameTypeListHint: "fantasy_5: Fantasy 5",
    });

    expect(result.mainNumbers).toEqual([1, 2, 3, 4, 5]);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    expect(mockResponsesCreate.mock.calls[0]?.[0]?.model).toBe("gpt-4.1-mini");
    expect(mockResponsesCreate.mock.calls[1]?.[0]?.model).toBe("gpt-4.1");
  });

  it("throws when both primary and fallback ticket outputs are invalid", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_OCR_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_OCR_FALLBACK_MODEL", "gpt-4.1");
    mockResponsesCreate
      .mockResolvedValueOnce({
        id: "resp_ticket_invalid_primary_again",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  gameType: "fantasy_5",
                  drawDate: "2030-01-05",
                  drawTime: "evening",
                  mainNumbers: [1, 2],
                  specialNumbers: [],
                }),
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "resp_ticket_invalid_fallback_again",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  gameType: "fantasy_5",
                  drawDate: "2030-01-05",
                  drawTime: "evening",
                  mainNumbers: [1],
                  specialNumbers: [],
                }),
              },
            ],
          },
        ],
      });

    const mod = await import("./_core/openai-ocr");
    await expect(
      mod.extractTicketFromImageWithOpenAI({
        imageUrl: "https://example.com/ticket.png",
        gameTypeListHint: "fantasy_5: Fantasy 5",
      })
    ).rejects.toThrow(/Fallback OCR output failed validation/i);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
  });

  it("falls back for PDF OCR when primary draw extraction is invalid", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_OCR_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_OCR_FALLBACK_MODEL", "gpt-4.1");
    mockResponsesCreate
      .mockResolvedValueOnce({
        id: "resp_pdf_invalid_primary",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  draws: [
                    {
                      gameType: "fantasy_5",
                      drawDate: "2030-01-05",
                      drawTime: "evening",
                      mainNumbers: [1, 2, 3], // invalid count
                      specialNumbers: [],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "resp_pdf_valid_fallback",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  draws: [
                    {
                      gameType: "fantasy_5",
                      drawDate: "2030-01-05",
                      drawTime: "evening",
                      mainNumbers: [1, 2, 3, 4, 5],
                      specialNumbers: [],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      });

    const mod = await import("./_core/openai-ocr");
    const draws = await mod.extractPdfDrawsWithOpenAI({
      pdfUrl: "https://example.com/file.pdf",
      gameHint: "Infer game",
      gameTypeListHint: "fantasy_5: Fantasy 5",
    });

    expect(draws).toHaveLength(1);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    expect(mockResponsesCreate.mock.calls[0]?.[0]?.model).toBe("gpt-4.1-mini");
    expect(mockResponsesCreate.mock.calls[1]?.[0]?.model).toBe("gpt-4.1");
  });

  it("uses sane fallback model default when OPENAI_OCR_FALLBACK_MODEL is blank", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_OCR_MODEL", "gpt-4.1-mini");
    vi.stubEnv("OPENAI_OCR_FALLBACK_MODEL", "");
    mockResponsesCreate
      .mockResolvedValueOnce({
        id: "resp_ticket_invalid_primary_blank_fallback_env",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  gameType: "fantasy_5",
                  drawDate: "2030-01-05",
                  drawTime: "evening",
                  mainNumbers: [1, 2, 3],
                  specialNumbers: [],
                }),
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "resp_ticket_valid_default_fallback",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  gameType: "fantasy_5",
                  drawDate: "2030-01-05",
                  drawTime: "evening",
                  mainNumbers: [1, 2, 3, 4, 5],
                  specialNumbers: [],
                }),
              },
            ],
          },
        ],
      });

    const mod = await import("./_core/openai-ocr");
    await mod.extractTicketFromImageWithOpenAI({
      imageUrl: "https://example.com/ticket.png",
      gameTypeListHint: "fantasy_5: Fantasy 5",
    });

    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    expect(mockResponsesCreate.mock.calls[1]?.[0]?.model).toBe("gpt-4.1");
  });
});
