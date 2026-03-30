export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { safeBuildUrl, safeOrigin, safeRelativePath } from "./lib/safe-url";
import { resolveClientAuthConfig } from "./lib/runtime-config";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const config = resolveClientAuthConfig();

  if (config.authDisabled) {
    return safeRelativePath("/");
  }

  const oauthPortalUrl = config.oauthPortalUrl;
  const appId = config.appId;
  const origin = safeOrigin();
  const redirectUri = safeBuildUrl("/api/oauth/callback", origin)?.toString() ?? `${origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const authBase = safeBuildUrl("/app-auth", oauthPortalUrl || origin);

  if (!authBase) {
    // Never hard-crash app startup due to malformed auth env. Fall back to app root.
    console.warn("[AUTH] Login URL unavailable due to invalid OAuth config", {
      reason: config.loginUnavailableReason || "invalid_oauth_url",
    });
    return safeRelativePath("/");
  }

  if (appId) {
    authBase.searchParams.set("appId", appId);
  }
  authBase.searchParams.set("redirectUri", redirectUri);
  authBase.searchParams.set("state", state);
  authBase.searchParams.set("type", "signIn");

  return authBase.toString();
};

/**
 * Build-safe client auth config.
 * NOTE: Vite injects VITE_* values at build time; runtime env edits do not
 * affect already-built frontend bundles until redeploy/rebuild.
 * See ENVIRONMENT.md for deployment details.
 */
export const CLIENT_AUTH_CONFIG = {
  ...resolveClientAuthConfig(),
} as const;
