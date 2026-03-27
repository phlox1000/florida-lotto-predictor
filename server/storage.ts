import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_UPLOAD_DIR = "/tmp/uploads";
const PUBLIC_UPLOAD_PREFIX = "/uploads";

function getUploadDir(): string {
  return process.env.LOCAL_UPLOADS_DIR || DEFAULT_UPLOAD_DIR;
}

function normalizeKey(relKey: string): string {
  return relKey
    .replace(/^\/+/, "")
    .split("/")
    .filter(part => part.length > 0 && part !== "." && part !== "..")
    .join("/");
}

function resolveUploadPath(key: string): string {
  const uploadDir = path.resolve(getUploadDir());
  const filePath = path.resolve(uploadDir, key);

  if (filePath !== uploadDir && !filePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw new Error("Invalid storage key");
  }

  return filePath;
}

function toBuffer(data: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data, "utf8");
  return Buffer.from(data);
}

function toPublicUrl(key: string): string {
  return `${PUBLIC_UPLOAD_PREFIX}/${key}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (!key) throw new Error("Storage key is required");

  const filePath = resolveUploadPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, toBuffer(data));

  return { key, url: toPublicUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const key = normalizeKey(relKey);
  if (!key) throw new Error("Storage key is required");

  const filePath = resolveUploadPath(key);
  await fs.access(filePath);

  return { key, url: toPublicUrl(key) };
}
