const HOSTNAME_LIKE_RE = /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i;
const ABSOLUTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export function toCleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeCandidate(candidate: string): string {
  if (!candidate) return "";
  if (candidate.startsWith("://") || candidate.startsWith(":")) return "";
  if (ABSOLUTE_SCHEME_RE.test(candidate)) return candidate;
  if (candidate.startsWith("//")) return `https:${candidate}`;
  if (HOSTNAME_LIKE_RE.test(candidate)) return `https://${candidate}`;
  return candidate;
}

export function parseBooleanFlag(value: unknown): boolean {
  const normalized = toCleanString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function safeOrigin(
  rawOrigin?: unknown,
  fallback = "http://localhost"
): string {
  const normalized = normalizeCandidate(toCleanString(rawOrigin));
  if (normalized) {
    try {
      return new URL(normalized).origin;
    } catch {
      // Fall through to browser origin or fallback.
    }
  }

  if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
    const origin = window.location.origin.trim();
    if (origin) return origin;
  }
  return fallback;
}

type SafeBuildUrlOptions = {
  base?: unknown;
  originFallback?: string;
};

export function safeBuildUrl(
  rawValue: unknown,
  optionsOrBase?: SafeBuildUrlOptions | unknown,
  maybeOptions?: { originFallback?: string }
): URL | null {
  const value = normalizeCandidate(toCleanString(rawValue));
  if (!value) return null;

  const options =
    optionsOrBase && typeof optionsOrBase === "object" && ("base" in (optionsOrBase as Record<string, unknown>) || "originFallback" in (optionsOrBase as Record<string, unknown>))
      ? (optionsOrBase as SafeBuildUrlOptions)
      : {
        base: optionsOrBase,
        originFallback: maybeOptions?.originFallback,
      };
  const normalizedBase = normalizeCandidate(toCleanString(options.base));
  const origin = options.originFallback ?? safeOrigin();

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
    (origin ? parse(value, origin) : null)
  );
}

export function safeJoinPath(
  base: unknown,
  path: unknown,
  options?: { fallback?: string; originFallback?: string }
): string | null {
  const url = safeBuildUrl(path, { base, originFallback: options?.originFallback });
  if (!url) return options?.fallback ?? null;
  return url.toString();
}

export function safeRelativePath(
  rawPath: unknown,
  fallbackOrOptions: string | { fallback?: string; currentOrigin?: string } = "/"
): string {
  const options =
    typeof fallbackOrOptions === "string"
      ? { fallback: fallbackOrOptions, currentOrigin: safeOrigin() }
      : {
        fallback: fallbackOrOptions.fallback ?? "/",
        currentOrigin: fallbackOrOptions.currentOrigin ?? safeOrigin(),
      };
  const cleaned = toCleanString(rawPath);
  if (!cleaned) return options.fallback;
  const url = safeBuildUrl(cleaned, { base: options.currentOrigin, originFallback: options.currentOrigin });
  if (!url) return options.fallback;
  if (url.origin !== options.currentOrigin) return options.fallback;
  return `${url.pathname}${url.search}${url.hash}` || options.fallback;
}
