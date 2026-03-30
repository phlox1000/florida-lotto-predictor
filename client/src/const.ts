export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { toCleanString } from "@shared/url-safe";
import { isAuthDisabled, safeBuildUrl, safeOrigin, safeRelativePath } from "./lib/safe-url";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (isAuthDisabled()) {
    return safeRelativePath("/");
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL as string | undefined;
  const appId = import.meta.env.VITE_APP_ID as string | undefined;
  const origin = safeOrigin();
  const redirectUri = safeBuildUrl("/api/oauth/callback", origin)?.toString() ?? `${origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const authBase = safeBuildUrl("/app-auth", oauthPortalUrl ?? origin);

  if (!authBase) {
    // Never hard-crash app startup due to malformed auth env. Fall back to app root.
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
  oauthPortalUrl: toCleanString(import.meta.env.VITE_OAUTH_PORTAL_URL as string | undefined) || null,
  appId: toCleanString(import.meta.env.VITE_APP_ID as string | undefined) || null,
  authDisabled: isAuthDisabled(),
} as const;
