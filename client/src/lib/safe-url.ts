const HOSTNAME_LIKE_RE = /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i;
const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function toCleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeCandidate(candidate: string): string {
  if (!candidate) return "";
  if (ABSOLUTE_SCHEME_RE.test(candidate)) return candidate;
  if (candidate.startsWith("//")) return `https:${candidate}`;
  if (HOSTNAME_LIKE_RE.test(candidate)) return `https://${candidate}`;
  return candidate;
}

export function parseBooleanFlag(value: unknown): boolean {
  const normalized = toCleanString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

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
  const value = normalizeCandidate(toCleanString(rawValue));
  if (!value) return null;

  const normalizedBase = normalizeCandidate(toCleanString(base));
  const origin = safeOrigin();

  const parse = (candidate: string, maybeBase?: string): URL | null => {
    try {
      if (maybeBase) return new URL(candidate, maybeBase);
      return new URL(candidate);
    } catch {
      return null;
    }
  };

  return (
    (normalizedBase ? parse(value, normalizedBase) : null) ||
    parse(value) ||
    parse(value, origin)
  );
}

export function safeRelativePath(rawPath: unknown, fallback = "/"): string {
  const cleaned = toCleanString(rawPath);
  if (!cleaned) return fallback;
  const url = safeBuildUrl(cleaned, safeOrigin());
  if (!url) return fallback;
  const currentOrigin = safeOrigin();
  if (url.origin !== currentOrigin) return fallback;
  return `${url.pathname}${url.search}${url.hash}` || fallback;
}

export function isAuthDisabled(): boolean {
  const viteFlag = parseBooleanFlag((import.meta as any)?.env?.VITE_DISABLE_AUTH);
  const rawFlag = parseBooleanFlag((import.meta as any)?.env?.DISABLE_AUTH);
  return viteFlag || rawFlag;
}

// Backward-compatible aliases for modules already importing this naming.
export const getClientOrigin = safeOrigin;
export const toSafeUrl = safeBuildUrl;
