# Deployment (Render)

This project ships a `render.yaml` blueprint spec for documentation and recovery. The live service may still be managed manually in the Render dashboard; match the environment there to this file when making changes.

## Environment variables

### Required (web and cron)

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` in hosted environments. |
| `DATABASE_URL` | MySQL connection string (Drizzle). |
| `JWT_SECRET` | Secret for signing session cookies. |
| `VITE_APP_ID` | Application / OAuth client identifier. |
| `OAUTH_SERVER_URL` | OAuth server base URL. |
| `OWNER_OPEN_ID` | Owner account OpenID (admin resolution). |

### LLM / Forge (optional for AI narrative)

The AI Analysis feature uses a chat-completions compatible HTTP API. If credentials are missing or the upstream call fails, the server returns a **data-driven local summary** from draw history and model performance tables so the feature remains usable.

| Variable | Status | Notes |
| --- | --- | --- |
| `FORGE_API_URL` | **Preferred** | Base URL of the gateway (e.g. Manus Forge). Trailing slash optional. |
| `FORGE_API_KEY` | **Preferred** | Bearer token for the gateway. |
| `BUILT_IN_FORGE_API_URL` | Legacy alias | Same as `FORGE_API_URL` if the preferred name is unset. |
| `BUILT_IN_FORGE_API_KEY` | Legacy alias | Same as `FORGE_API_KEY` if the preferred name is unset. |
| `OPENAI_API_KEY` | Optional key fallback | Used only as an **API key** when `FORGE_API_KEY` and legacy built-in keys are empty. Does not change the default Forge URL. |

**Migration:** Set `FORGE_API_URL` and `FORGE_API_KEY` in the Render Environment tab, then remove `BUILT_IN_FORGE_API_*` when convenient to avoid confusion. No code change is required for either name; the server resolves them in this order: preferred → built-in → (key only) `OPENAI_API_KEY`.

### Optional

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | Render Key Value (Redis) for shared rate limits when `numInstances` > 1. |

### Frontend (build-time, Vite)

`VITE_FRONTEND_FORGE_API_KEY` and `VITE_FRONTEND_FORGE_API_URL` are only used by specific client features (e.g. maps). They are separate from server `FORGE_API_*` variables.

## Health and rollouts

- Web service health check: `GET /healthz` returns JSON `{ "ok": true, "uptime": number }` (see `render.yaml` comments).
- tRPC HTTP endpoint: `POST /trpc` (and legacy alias `POST /api/trpc`).
- Manual deploys: the project may keep auto-deploy off; merge to `main` does not always roll out until a human deploys in the dashboard.
