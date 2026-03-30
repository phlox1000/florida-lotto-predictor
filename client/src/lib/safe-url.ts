import {
  safeBuildUrl as sharedSafeBuildUrl,
  safeJoinPath as sharedSafeJoinPath,
  safeRelativePath as sharedSafeRelativePath,
} from "@shared/url-safe";
import { getAuthDisableResolution } from "./runtime-config";

export function safeOrigin(fallback = "http://localhost"): string {
  if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
    const origin = window.location.origin.trim();
    if (origin) return origin;
  }
  return fallback;
}

export function safeBuildUrl(
  rawValue: unknown,
  base?: unknown
): URL | null {
  return sharedSafeBuildUrl(rawValue, {
    base,
    originFallback: safeOrigin(),
  });
}

export function safeRelativePath(rawPath: unknown, fallback = "/"): string {
  return sharedSafeRelativePath(rawPath, {
    fallback,
    currentOrigin: safeOrigin(),
  });
}

export function safeJoinPath(base: unknown, path: unknown, fallback = "/"): string {
  return sharedSafeJoinPath(base, path, {
    fallback,
    originFallback: safeOrigin(),
  }) || fallback;
}

export function isAuthDisabled(): boolean {
  return getAuthDisableResolution().value;
}

// Backward-compatible aliases for modules already importing this naming.
export const getClientOrigin = safeOrigin;
export const toSafeUrl = safeBuildUrl;
