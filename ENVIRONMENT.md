# Environment Variables & URL Safety

This repository uses both server-side and client-side environment variables.

## Important: Vite client env behavior

- Variables read via `import.meta.env.VITE_*` are injected at **build time**.
- Changing these env vars at runtime (without rebuilding/redeploying the frontend bundle) will **not** change client behavior.
- For production deploys (Render), update env vars and trigger a new build/deploy when changing any `VITE_*` value.

## Canonical auth env naming and precedence

- **Frontend canonical**: `VITE_DISABLE_AUTH`
- **Frontend compatibility alias**: `DISABLE_AUTH`
- **Frontend precedence rule**: `VITE_DISABLE_AUTH` wins when both are set.
- If both are present and contradictory, the client logs:
  - `[AUTH] Conflicting auth flags detected; VITE_DISABLE_AUTH takes precedence`
  - Then follows `VITE_DISABLE_AUTH`.
- **Server canonical**: `DISABLE_AUTH`
- Server does not read `VITE_DISABLE_AUTH` directly.

## Client-side auth and URL config

- `VITE_OAUTH_PORTAL_URL` (optional): OAuth portal base used for login URL generation.
- `VITE_APP_ID` (optional): app identifier attached to login URL params.
- `VITE_DISABLE_AUTH` (optional, canonical): frontend auth-disable flag.
- `DISABLE_AUTH` (optional, compatibility alias): honored by frontend only when `VITE_DISABLE_AUTH` is unset.

When auth is disabled (`VITE_DISABLE_AUTH=true` or `DISABLE_AUTH=true`):

- frontend auth redirects are bypassed,
- OAuth URL construction is bypassed,
- app startup does not require OAuth portal env values.

When auth is enabled but OAuth config is invalid or unavailable:

- app still renders (no startup crash),
- sign-in attempts are blocked gracefully with user message:
  - `Sign-in is currently unavailable. Please try again later.`
- technical details are logged in console with `[AUTH]` / `[CONFIG]` tags.

Client startup also performs non-throwing runtime config validation and logs structured warnings for:

- missing `VITE_OAUTH_PORTAL_URL`,
- malformed `VITE_OAUTH_PORTAL_URL`,
- contradictory auth flags.

## Server-side auth config

- `DISABLE_AUTH=true` bypasses backend auth in context and issues a stable mock session.
- `OAUTH_SERVER_URL` is required only for active OAuth flows.
- `BUILT_IN_FORGE_API_URL` and `LLM_API_URL` are validated at startup with warnings (non-throwing validation path).

## URL safety guardrails

URL/config construction should use shared safety helpers:

- `shared/url-safe.ts`
  - `safeBuildUrl(...)`
  - `safeOrigin(...)`
  - `safeRelativePath(...)`
  - `safeJoinPath(...)`
  - `parseBooleanFlag(...)`
  - `parseOptionalBooleanFlag(...)`

- `server/_core/url-safe.ts`
  - `safeServerUrl(...)`
  - `requireServerServiceUrl(...)`

These helpers are designed to fail safe (return null/fallback) or throw explicit config errors on server-side required service URLs.

## Render recommended setup

Set both frontend and backend auth flags explicitly to avoid ambiguity:

- `VITE_DISABLE_AUTH=true|false` (frontend canonical)
- `DISABLE_AUTH=true|false` (backend canonical, frontend compatibility)

For normal OAuth-enabled production:

- `VITE_DISABLE_AUTH=false`
- `DISABLE_AUTH=false`
- `VITE_OAUTH_PORTAL_URL=https://<oauth-portal-host>`
- `VITE_APP_ID=<app-id>`
- `OAUTH_SERVER_URL=https://<oauth-server-host>`

For auth-disabled diagnostics/internal mode:

- `VITE_DISABLE_AUTH=true`
- `DISABLE_AUTH=true`
- OAuth URL envs can be unset, app still loads.
