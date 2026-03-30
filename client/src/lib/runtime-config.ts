import { parseOptionalBooleanFlag, safeBuildUrl, toCleanString } from "@shared/url-safe";

type AuthDisableSource = "VITE_DISABLE_AUTH" | "DISABLE_AUTH" | "default_false";

export type ResolvedClientAuthConfig = {
  authDisabled: boolean;
  authDisableSource: AuthDisableSource;
  oauthPortalUrl: string | null;
  oauthPortalUrlIsValid: boolean;
  appId: string | null;
  canStartLoginFlow: boolean;
  loginUnavailableReason: string | null;
};

type WarnLogger = (message: string, details?: Record<string, unknown>) => void;

let startupValidationLogged = false;
let startupAuthDisabledLogged = false;
let startupConflictLogged = false;
let startupMissingOauthPortalLogged = false;
let startupMalformedOauthPortalLogged = false;

const defaultWarnLogger: WarnLogger = (message, details) => {
  if (details) {
    console.warn(message, details);
    return;
  }
  console.warn(message);
};

export function getAuthDisableResolution(
  env: Record<string, unknown> = (import.meta as any)?.env ?? {}
): { value: boolean; source: AuthDisableSource; contradiction: boolean } {
  const vite = parseOptionalBooleanFlag(env.VITE_DISABLE_AUTH);
  const legacy = parseOptionalBooleanFlag(env.DISABLE_AUTH);
  const contradiction = vite !== null && legacy !== null && vite !== legacy;

  if (vite !== null) {
    return {
      value: vite,
      source: "VITE_DISABLE_AUTH",
      contradiction,
    };
  }

  if (legacy !== null) {
    return {
      value: legacy,
      source: "DISABLE_AUTH",
      contradiction: false,
    };
  }

  return {
    value: false,
    source: "default_false",
    contradiction: false,
  };
}

export function resolveClientAuthConfig(
  env: Record<string, unknown> = (import.meta as any)?.env ?? {},
  warn: WarnLogger = defaultWarnLogger
): ResolvedClientAuthConfig {
  const disable = getAuthDisableResolution(env);
  const oauthPortalRaw = toCleanString(env.VITE_OAUTH_PORTAL_URL);
  const appId = toCleanString(env.VITE_APP_ID) || null;
  const oauthPortalUrl = oauthPortalRaw || null;
  const oauthPortalUrlIsValid = oauthPortalUrl
    ? Boolean(
      safeBuildUrl(oauthPortalRaw, {
        // Validate raw env value itself; allow relative values.
        base: "https://example.com",
        originFallback: "",
      })
    )
    : false;

  if (disable.contradiction && (warn !== defaultWarnLogger || !startupConflictLogged)) {
    if (warn === defaultWarnLogger) startupConflictLogged = true;
    warn("[AUTH] Conflicting auth flags detected; VITE_DISABLE_AUTH takes precedence", {
      VITE_DISABLE_AUTH: env.VITE_DISABLE_AUTH ?? null,
      DISABLE_AUTH: env.DISABLE_AUTH ?? null,
    });
  }

  if (!disable.value) {
    if (!oauthPortalUrl && (warn !== defaultWarnLogger || !startupMissingOauthPortalLogged)) {
      if (warn === defaultWarnLogger) startupMissingOauthPortalLogged = true;
      warn("[CONFIG] Missing VITE_OAUTH_PORTAL_URL; login will be unavailable until configured.");
    } else if (!oauthPortalUrlIsValid && (warn !== defaultWarnLogger || !startupMalformedOauthPortalLogged)) {
      if (warn === defaultWarnLogger) startupMalformedOauthPortalLogged = true;
      warn("[CONFIG] Malformed VITE_OAUTH_PORTAL_URL; login will be unavailable until fixed.", {
        value: oauthPortalUrl,
      });
    }
  }

  let loginUnavailableReason: string | null = null;
  if (!disable.value && !oauthPortalUrl) {
    loginUnavailableReason = "missing_oauth_portal_url";
  } else if (!disable.value && !oauthPortalUrlIsValid) {
    loginUnavailableReason = "malformed_oauth_portal_url";
  }

  return {
    authDisabled: disable.value,
    authDisableSource: disable.source,
    oauthPortalUrl,
    oauthPortalUrlIsValid,
    appId,
    canStartLoginFlow: disable.value || oauthPortalUrlIsValid,
    loginUnavailableReason,
  };
}

export function validateClientRuntimeConfigOnce(
  env: Record<string, unknown> = (import.meta as any)?.env ?? {}
): ResolvedClientAuthConfig {
  const config = resolveClientAuthConfig(env);

  if (!startupValidationLogged) {
    startupValidationLogged = true;
    console.info("[CONFIG] Client runtime config validated");
  }

  if (config.authDisabled && !startupAuthDisabledLogged) {
    startupAuthDisabledLogged = true;
    console.info("[AUTH] Disabled via environment flag", {
      source: config.authDisableSource,
    });
  }

  return config;
}

export function resetClientRuntimeConfigValidationForTests() {
  startupValidationLogged = false;
  startupAuthDisabledLogged = false;
  startupConflictLogged = false;
  startupMissingOauthPortalLogged = false;
  startupMalformedOauthPortalLogged = false;
}
