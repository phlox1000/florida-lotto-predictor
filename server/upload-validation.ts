const BASE64_ALLOWED_RE = /^[A-Za-z0-9+/=\s]+$/;

export type SupportedImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

export function stripDataUrlPrefix(maybeDataUrl: string): string {
  const idx = maybeDataUrl.indexOf("base64,");
  if (idx >= 0) return maybeDataUrl.slice(idx + "base64,".length);
  return maybeDataUrl;
}

export function decodeBase64PayloadToBuffer(value: unknown): Buffer | null {
  const raw = stripDataUrlPrefix(String(value ?? "")).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) return null;
  if (!BASE64_ALLOWED_RE.test(normalized)) return null;

  try {
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length === 0) return null;
    const decodedNormalized = decoded.toString("base64").replace(/=+$/g, "");
    const inputNormalized = normalized.replace(/=+$/g, "");
    if (decodedNormalized !== inputNormalized) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer.subarray(0, 4).toString("ascii") === "%PDF";
}

export function detectImageMimeType(
  buffer: Buffer
): SupportedImageMimeType | null {
  if (buffer.length >= 8) {
    const pngSignature = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ];
    const isPng = pngSignature.every((byte, idx) => buffer[idx] === byte);
    if (isPng) return "image/png";
  }

  if (buffer.length >= 3) {
    const isJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (isJpeg) return "image/jpeg";
  }

  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString("ascii");
    const webp = buffer.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }

  return null;
}

export function llmContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const type = (part as any).type;
      if (type === "text") return String((part as any).text || "");
      return "";
    })
    .join("")
    .trim();
}
