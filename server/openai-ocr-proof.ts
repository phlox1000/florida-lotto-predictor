import "dotenv/config";
import { promises as fs } from "node:fs";
import { ENV } from "./_core/env";
import {
  extractPdfDrawsWithOpenAI,
  extractTicketFromImageWithOpenAI,
  getRecentOpenAiOcrLogs,
} from "./_core/openai-ocr";
import { storagePut } from "./storage";
import { FLORIDA_GAMES, GAME_TYPES } from "@shared/lottery";

function buildGameTypeHint(): string {
  return GAME_TYPES.map(gt => {
    const cfg = FLORIDA_GAMES[gt];
    return `${gt}: ${cfg.name} (${cfg.mainCount} main${cfg.specialCount ? ` + ${cfg.specialCount} special` : ""})`;
  }).join("\n");
}

async function putLocalArtifacts() {
  const imageBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0K8fQAAAAASUVORK5CYII=",
    "base64"
  );
  const pdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj<<>>endobj\n2 0 obj<< /Length 44 >>stream\nBT /F1 12 Tf 72 720 Td (01/05/2030) Tj ET\nendstream endobj\ntrailer<<>>\n%%EOF\n",
    "utf8"
  );

  const image = await storagePut(
    `ocr-proof/openai-proof-${Date.now()}.png`,
    imageBuffer,
    "image/png"
  );
  const pdf = await storagePut(
    `ocr-proof/openai-proof-${Date.now()}.pdf`,
    pdfBuffer,
    "application/pdf"
  );
  return { imageUrl: image.url, pdfUrl: pdf.url };
}

async function main() {
  console.info("[OCR][OpenAI][Proof] Starting runtime proof", {
    hasOpenAiApiKey: Boolean(ENV.openAiApiKey),
    model: ENV.openAiModel,
  });

  const hints = buildGameTypeHint();
  const { imageUrl, pdfUrl } = await putLocalArtifacts();
  const result: Record<string, unknown> = {
    environment: {
      hasOpenAiApiKey: Boolean(ENV.openAiApiKey),
      model: ENV.openAiModel,
      usesClientEnvVar: Boolean(process.env.VITE_OPENAI_API_KEY),
    },
    inputs: { imageUrl, pdfUrl },
  };

  try {
    const ticket = await extractTicketFromImageWithOpenAI({
      imageUrl,
      gameTypeListHint: hints,
    });
    result.ticketExtraction = ticket;
  } catch (error) {
    result.ticketExtractionError = error instanceof Error ? error.message : String(error);
  }

  try {
    const pdfDraws = await extractPdfDrawsWithOpenAI({
      pdfUrl,
      gameHint: "Use game type visible in document.",
      gameTypeListHint: hints,
    });
    result.pdfExtraction = pdfDraws;
  } catch (error) {
    result.pdfExtractionError = error instanceof Error ? error.message : String(error);
  }

  result.ocrTraceLogs = getRecentOpenAiOcrLogs(40);
  const json = JSON.stringify(result, null, 2);
  await fs.writeFile("/opt/cursor/artifacts/openai_ocr_proof_output.json", json, "utf8");
  console.log(json);
}

main().catch(error => {
  console.error("[OCR][OpenAI][Proof] Fatal failure", error);
  process.exit(1);
});
