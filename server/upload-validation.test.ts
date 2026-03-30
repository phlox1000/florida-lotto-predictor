import { describe, expect, it } from "vitest";
import {
  decodeBase64PayloadToBuffer,
  detectImageMimeType,
  isPdfBuffer,
  llmContentToText,
} from "./upload-validation";

describe("upload-validation helpers", () => {
  it("rejects malformed base64 payloads", () => {
    expect(decodeBase64PayloadToBuffer("not-base64-@@")).toBeNull();
    expect(decodeBase64PayloadToBuffer("")).toBeNull();
  });

  it("accepts valid base64 payloads", () => {
    const value = Buffer.from("hello world", "utf8").toString("base64");
    const decoded = decodeBase64PayloadToBuffer(value);
    expect(decoded?.toString("utf8")).toBe("hello world");
  });

  it("detects PDF signatures", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\n", "ascii");
    const txtBuffer = Buffer.from("hello", "utf8");
    expect(isPdfBuffer(pdfBuffer)).toBe(true);
    expect(isPdfBuffer(txtBuffer)).toBe(false);
  });

  it("detects supported image mime types from bytes", () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
      "hex"
    );
    const jpg = Buffer.from("ffd8ffe000104a464946", "hex");
    const webp = Buffer.from("524946460000000057454250", "hex");
    const unknown = Buffer.from("00112233", "hex");
    expect(detectImageMimeType(png)).toBe("image/png");
    expect(detectImageMimeType(jpg)).toBe("image/jpeg");
    expect(detectImageMimeType(webp)).toBe("image/webp");
    expect(detectImageMimeType(unknown)).toBeNull();
  });

  it("extracts text content from LLM content arrays", () => {
    const text = llmContentToText([
      { type: "text", text: "{\"ok\":true}" },
      { type: "image_url", image_url: { url: "x" } },
    ]);
    expect(text).toBe("{\"ok\":true}");
  });
});
