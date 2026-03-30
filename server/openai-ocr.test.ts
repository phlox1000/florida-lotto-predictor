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
  });
});
