# Environment Variables & URL Safety

This repository uses both server-side and client-side environment variables.

## Important: Vite client env behavior

- Variables read via `import.meta.env.VITE_*` are injected at **build time**.
- Changing these env vars at runtime (without rebuilding/redeploying the frontend bundle) will **not** change client behavior.
- For production deploys (Render), update env vars and trigger a new build/deploy when changing any `VITE_*` value.

## Client-side auth and URL config

- `VITE_OAUTH_PORTAL_URL` (optional): OAuth portal base used for login URL generation.
- `VITE_APP_ID` (optional): app identifier attached to login URL params.
- `VITE_DISABLE_AUTH` (optional): frontend auth-disable flag.
- `DISABLE_AUTH` is also accepted by frontend code for compatibility with existing deploy setups.

When auth is disabled (`VITE_DISABLE_AUTH=true` or `DISABLE_AUTH=true`):

- frontend auth redirects are bypassed,
- OAuth URL construction is bypassed,
- app startup does not require OAuth portal env values.

## Server-side auth config

- `DISABLE_AUTH=true` bypasses backend auth in context and issues a stable mock session.
- `OAUTH_SERVER_URL` is required only for active OAuth flows.

## URL safety guardrails

URL/config construction should use shared safety helpers:

- `shared/url-safe.ts`
  - `safeBuildUrl(...)`
  - `safeOrigin(...)`
  - `safeRelativePath(...)`
  - `safeJoinPath(...)`
  - `parseBooleanFlag(...)`

- `server/_core/url-safe.ts`
  - `safeServerUrl(...)`
  - `requireServerServiceUrl(...)`

These helpers are designed to fail safe (return null/fallback) or throw explicit config errors on server-side required service URLs.
