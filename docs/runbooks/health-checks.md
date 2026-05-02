# Health check runbook

## Endpoints

### `GET /healthz` — liveness probe

Lightweight check. Returns 200 if the process is alive and serving HTTP.

Example response (captured 2026-05-02):

```json
{"ok": true, "uptime": 2465.949416699}
```

`uptime` is in seconds since the Node process started. A small value immediately after a deploy confirms the new process replaced the old one. A value that resets unexpectedly may indicate a crash + restart loop — cross-check with Render Events for a recent restart.

Use case: Render's auto-restart trigger, external uptime monitors, on-call quick check.

### `GET /health` — service health

Returns 200 with a richer payload (timestamp + OAuth configuration flag). Use for diagnostic checks when the app is misbehaving but the process appears alive.

Example response (captured 2026-05-02):

```json
{"status": "ok", "timestamp": 1777737989760, "oauthConfigured": true}
```

`oauthConfigured` reflects whether the server detected OAuth env vars at startup. If it ever returns `false` in production, the app's auth path is going to fail — fix the env vars in Render dashboard and restart.

Use case: confirming env vars propagated after a config change in Render dashboard, confirming OAuth setup before debugging an auth issue further.

## Quick verification commands

```bash
curl -sS https://florida-lotto-predictor.onrender.com/healthz
curl -sS https://florida-lotto-predictor.onrender.com/health
```

Run both; expect HTTP 200 from each. If either returns non-200 or hangs, the service is degraded — go straight to Render dashboard → Logs.

## Reading Render logs for known patterns

### `[startup] env check {...}`

Fires on every Node process start. Confirms which env vars are populated. Critical vars (`DATABASE_URL`, `JWT_SECRET`, `OAUTH_SERVER_URL`) must be `true`. The `MANUS_*` vars being `false` is expected — they were never wired and are not in active use.

### `[predictions] prediction_learning_metrics missing — falling back to non-personalized scoring`

Expected once per process lifetime until the migration runs. If it fires more than once per Render restart, the one-shot flag in `server/db.ts` is broken. See `docs/incidents/2026-05-02-prediction-learning-metrics-missing.md` for context.

### `[OAuth] Initialized with baseURL: https://api.manus.im`

Fires once per process start. Cosmetic only — the OAuth code reads `OAUTH_SERVER_URL` env, which is set; the `MANUS_*` env names are vestigial from earlier exploration.

### `ELIFECYCLE Command failed`

Indicates the Node process exited with a non-zero code. Should be rare. If you see it, check the lines immediately above for the cause (uncaught exception, unhandled rejection, or explicit `process.exit(1)`). The handlers in `server/_core/processHandlers.ts` should log the error before exit; if they don't, that's a bug to file.

## When to redeploy vs restart

- **Redeploy** (Render dashboard → Manual Deploy → Deploy latest commit): when new code has been merged to `main`. Required because `autoDeployTrigger: "off"` in `render.yaml`.
- **Restart** (Render dashboard → service → Events → Restart): when env vars have changed but no code change. Forces the new env into a fresh Node process.

After either action, hit `/healthz` and confirm `uptime` is small (< ~30 seconds) to verify the new process is actually serving traffic.
