import { parseOptionalBooleanFlag, safeBuildUrl, toCleanString } from "../../shared/url-safe";

let startupValidationLogged = false;
let startupAuthDisabledLogged = false;

type ServerWarn = (message: string, details?: Record<string, unknown>) => void;

function warn(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.warn(message, details);
    return;
  }
  console.warn(message);
}

type ServerAuthDisableSource = "DISABLE_AUTH" | "default_false";

export type ResolvedServerAuthConfig = {
  authDisabled: boolean;
  authDisableSource: ServerAuthDisableSource;
  oauthServerUrl: string | null;
  oauthServerUrlIsValid: boolean;
  forgeApiUrl: string | null;
  forgeApiUrlIsValid: boolean;
  llmApiUrl: string | null;
  llmApiUrlIsValid: boolean;
  openAiApiKeyPresent: boolean;
};

export function resolveServerAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  logger: ServerWarn = warn
): ResolvedServerAuthConfig {
  const disableAuthParsed = parseOptionalBooleanFlag(env.DISABLE_AUTH);
  const authDisabled = disableAuthParsed === true;
  const authDisableSource: ServerAuthDisableSource =
    disableAuthParsed !== null ? "DISABLE_AUTH" : "default_false";

  const oauthServerUrl = toCleanString(env.OAUTH_SERVER_URL) || null;
  const forgeApiUrl = toCleanString(env.BUILT_IN_FORGE_API_URL) || null;
  const llmApiUrl = toCleanString(env.LLM_API_URL) || null;
  const openAiApiKeyPresent = toCleanString(env.OPENAI_API_KEY).length > 0;

  const oauthServerUrlIsValid = oauthServerUrl
    ? Boolean(safeBuildUrl("webdev.v1.WebDevAuthPublicService/ExchangeToken", { base: oauthServerUrl }))
    : false;
  const forgeApiUrlIsValid = forgeApiUrl
    ? Boolean(safeBuildUrl("webdevtoken.v1.WebDevService/CallApi", { base: forgeApiUrl }))
    : false;
  const llmApiUrlIsValid = llmApiUrl
    ? Boolean(safeBuildUrl("v1/chat/completions", { base: llmApiUrl }))
    : false;

  if (!authDisabled) {
    if (!oauthServerUrl) {
      logger("[CONFIG] Missing OAUTH_SERVER_URL; OAuth sign-in callbacks will fail.");
    } else if (!oauthServerUrlIsValid) {
      logger("[CONFIG] Malformed OAUTH_SERVER_URL; OAuth sign-in callbacks will fail.", {
        value: oauthServerUrl,
      });
    }
  }

  if (forgeApiUrl && !forgeApiUrlIsValid) {
    logger("[CONFIG] Malformed BUILT_IN_FORGE_API_URL; forge-backed services may fail.", {
      value: forgeApiUrl,
    });
  }

  if (llmApiUrl && !llmApiUrlIsValid) {
    logger("[CONFIG] Malformed LLM_API_URL; LLM features may fail.", {
      value: llmApiUrl,
    });
  }

  if (!openAiApiKeyPresent) {
    logger(
      "[CONFIG] Missing OPENAI_API_KEY; OpenAI OCR extraction paths will fail until configured."
    );
  }

  return {
    authDisabled,
    authDisableSource,
    oauthServerUrl,
    oauthServerUrlIsValid,
    forgeApiUrl,
    forgeApiUrlIsValid,
    llmApiUrl,
    llmApiUrlIsValid,
    openAiApiKeyPresent,
  };
}

export function validateServerRuntimeConfigOnce(
  env: NodeJS.ProcessEnv = process.env
) {
  const config = resolveServerAuthConfig(env);
  if (!startupValidationLogged) {
    startupValidationLogged = true;
    console.info("[CONFIG] Server runtime config validated");
  }
  if (config.authDisabled && !startupAuthDisabledLogged) {
    startupAuthDisabledLogged = true;
    console.info("[AUTH] Disabled via environment flag", {
      source: config.authDisableSource,
      envDisableAuth: config.authDisabled,
    });
  }
  return config;
}

export function resetServerRuntimeConfigValidationForTests() {
  startupValidationLogged = false;
  startupAuthDisabledLogged = false;
}
