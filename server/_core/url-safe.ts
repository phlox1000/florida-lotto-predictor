import { safeBuildUrl as sharedSafeBuildUrl, toCleanString } from "../../shared/url-safe";

export function safeServerUrl(rawValue: unknown, base?: unknown): URL | null {
  return sharedSafeBuildUrl(rawValue, {
    base,
    originFallback: "http://localhost",
  });
}

export function requireServerServiceUrl(params: {
  servicePath: string;
  baseUrl: unknown;
  envName: string;
}): string {
  const built = safeServerUrl(params.servicePath, params.baseUrl);
  if (!built) {
    const base = toCleanString(params.baseUrl) || "<empty>";
    throw new Error(
      `${params.envName} is invalid for URL construction (base="${base}")`
    );
  }
  return built.toString();
}
