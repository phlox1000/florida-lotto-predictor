/**
 * Process-level logging for Render / production visibility.
 * Never logs secret values — only presence (boolean) of expected env keys.
 */

let registered = false;

export function logStartupEnv(): void {
  console.log("[startup] env check", {
    NODE_ENV: !!process.env.NODE_ENV,
    DATABASE_URL: !!process.env.DATABASE_URL,
    JWT_SECRET: !!process.env.JWT_SECRET,
    VITE_APP_ID: !!process.env.VITE_APP_ID,
    OAUTH_SERVER_URL: !!process.env.OAUTH_SERVER_URL,
    OWNER_OPEN_ID: !!process.env.OWNER_OPEN_ID,
    FORGE_API_URL: !!process.env.FORGE_API_URL,
    FORGE_API_KEY: !!process.env.FORGE_API_KEY,
    BUILT_IN_FORGE_API_URL: !!process.env.BUILT_IN_FORGE_API_URL,
    BUILT_IN_FORGE_API_KEY: !!process.env.BUILT_IN_FORGE_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    REDIS_URL: !!process.env.REDIS_URL,
    MANUS_CLIENT_ID: !!process.env.MANUS_CLIENT_ID,
    MANUS_CLIENT_SECRET: !!process.env.MANUS_CLIENT_SECRET,
    MANUS_OAUTH_BASE_URL: !!process.env.MANUS_OAUTH_BASE_URL,
  });
}

export function registerProcessHandlers(): void {
  if (registered) return;
  registered = true;

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[process] unhandledRejection", { reason, promise: String(promise) });
  });

  process.on("uncaughtException", err => {
    console.error("[process] uncaughtException", err);
  });
}
