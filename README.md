# Florida Lotto Predictor

Web, API, and mobile client for Florida lottery statistics, model-backed predictions, and pattern analysis. The product targets a serious, data-forward experience (not novelty styling).

> If you are an AI agent picking up this project, also read [`docs/AGENT_ONBOARDING.md`](./docs/AGENT_ONBOARDING.md) before starting work.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture overview](#2-architecture-overview)
3. [Stack](#3-stack)
4. [Repository structure](#4-repository-structure)
5. [Local development setup](#5-local-development-setup)
6. [Build and deployment](#6-build-and-deployment)
7. [Data and storage](#7-data-and-storage)
8. [CI/CD and quality gates](#8-cicd-and-quality-gates)
9. [Common gotchas](#9-common-gotchas-read-this-before-debugging)
10. [Multi-agent development workflow](#10-multi-agent-development-workflow)
11. [Incident history](#11-incident-history)
12. [Roadmap and known limitations](#12-roadmap-and-known-limitations)
13. [License](#license)

---

## 1. Project overview

Florida Lotto Predictor is a personal forecasting tool for Florida Lottery games (Powerball, Mega Millions, Florida Lotto, Cash4Life, Jackpot Triple Play, Fantasy 5, Pick 2/3/4/5, Cash Pop). It ingests draw history, runs an ensemble of statistical and lightweight ML models against that history, scores each candidate set against historical patterns, and surfaces both the model output and the supporting signals so the user can judge a pick rather than be told to trust it. It also tracks saved picks against subsequent live draws so model performance is observable rather than self-reported.

It is built for the maintainer's personal use first. The longer-term intent — captured in [Section 12](#12-roadmap-and-known-limitations) — is to factor the prediction "brain" (ensemble pipeline, scoring layer, learning loop, per-domain interfaces) into something portable enough to drive other prediction problems where the underlying domain has structured outcomes and observable feedback.

**Status:** Live in production. Web app and API are deployed on Render. The mobile app is distributed as an EAS-built APK and ships incremental updates via Expo Updates OTA. The backend has an active personalization loop that adjusts factor weights and model weights based on recent outcomes, though the `prediction_learning_metrics` table that backs that loop was missing from production until 2026-05-04 — see [Section 11](#11-incident-history). The server has a permanent fallback so the loop's absence degrades quality, not availability.

---

## 2. Architecture overview

This repo is a **pnpm monorepo** with four workspaces that share types and configuration:

| Workspace | What it is |
|---|---|
| `client/` | Vite + React web app. Talks to the same tRPC server. |
| `server/` | Node.js + tRPC server, Drizzle ORM, draw ingestion, prediction ensemble, scoring, personalization. |
| `shared/` | Shared TypeScript types, game configuration (`FLORIDA_GAMES`, `GAME_TYPES`), model metadata. Imported by both client and mobile. |
| `mobile/` | Expo SDK 54 React Native app. Ships as an APK and updates OTA. Imports from `shared/`, talks to `server/` via tRPC. |

There is also a separate **cron service** (`server/cron-runner.ts`) deployed alongside the web service for scheduled draw ingestion.

```
                     ┌────────────────────┐
                     │  React Web Client  │  (client/)
                     │      Vite / RN web │
                     └─────────┬──────────┘
                               │ tRPC (HTTP, batched, superjson)
                               │
┌────────────────────┐         ▼          ┌──────────────────────────┐
│   Mobile (Expo)    │   ┌───────────┐    │   Node + tRPC server     │
│  EAS APK + OTA     │──►│  /trpc    │───►│  (server/)               │
│  (mobile/)         │   │  /health* │    │  - routers/              │
└────────────────────┘   │  /        │    │  - predictions/          │
                         └───────────┘    │  - services/             │
                                          │  - db/  (Drizzle)        │
                                          │  - lib/                  │
                                          └────────────┬─────────────┘
                                                       │ Drizzle ORM
                                                       ▼
                                          ┌──────────────────────────┐
                                          │  MySQL 9.4 (Railway)     │
                                          │  schema in drizzle/      │
                                          └──────────────────────────┘

                Auth: JWT session tokens. OAuth bootstrap via OAUTH_SERVER_URL (Manus residual).
                Hosting: Render (web service + cron). Render auto-deploy is OFF; deploys are manual.
```

The mobile client is functionally equivalent to a subset of the web client for now: Analyze, Generate, Models, Track. Both clients hit `https://florida-lotto-predictor.onrender.com` in production by default; the mobile client's base URL is overridable via `EXPO_PUBLIC_API_URL`.

---

## 3. Stack

Pinned major versions only. See `package.json`, `mobile/package.json`, and `pnpm-lock.yaml` for the exact lockfile state.

### Backend / web

| Component | Version | Notes |
|---|---|---|
| Node.js | 22.x | Pinned in CI (`actions/setup-node@v4`); production runs on Render's Node 22 runtime <!-- TODO: verify Render runtime --> |
| pnpm | 10.4.1 | Pinned via `packageManager` in root `package.json`. CI reads from there; do not pass `with.version` to `pnpm/action-setup`. |
| TypeScript | ~5.9 | Root `tsconfig.json` uses `module: ESNext`, `target: ES2022`, `strict: true`. |
| Vite | ^7 | Web client bundler. <!-- TODO: confirm major in client/package.json --> |
| Drizzle ORM + Drizzle Kit | current | Migrations under `drizzle/`. `pnpm db:push` runs `generate && migrate`. |
| MySQL | 9.4 | Hosted on Railway. |
| tRPC | 11.x | `@trpc/server`, `@trpc/client`, `@trpc/react-query`. Mounted at `POST /trpc`. |
| Vitest | 2.x | Server tests live alongside source as `*.test.ts` in `server/`. |
| esbuild | latest | Server bundle via `pnpm build`. |

### Mobile

| Component | Version | Notes |
|---|---|---|
| Expo SDK | ~54.0.33 | Pinned in `mobile/package.json`. |
| React Native | 0.81.5 | Tied to Expo SDK 54. |
| React | 19.1.0 | |
| TypeScript | ~5.9 | `mobile/tsconfig.json` extends `expo/tsconfig.base`. |
| Expo Updates | ^29.0.16 | OTA orchestration. `runtimeVersion.policy = "appVersion"` in `app.config.ts`. |
| eas-cli | ^16.32 | Required dev dep. Build profiles in `mobile/eas.json` declare CLI floor `>= 18.7.0` <!-- TODO: this looks inconsistent with the installed eas-cli major; confirm whether the 18.x floor has been bumped or whether the dep should be raised --> |
| `@react-navigation/native` + `bottom-tabs` | ^7 | Bottom tab nav. |
| `@react-native-async-storage/async-storage` | 2.2.0 | Local persistence (saved picks ledger). |
| `expo-file-system` / `expo-sharing` / `expo-document-picker` | ~19.0.22 / ~14.0.8 / ~14.0.8 | Powers the picks Export/Import flow added in PR #55. |
| `expo-secure-store` | ~15.0.8 | Mobile session token storage. |
| `expo-updates` | ^29.0.16 | OTA. |
| `superjson` | ^1.13 | Required for tRPC transformer parity with the server. |

Mobile version source of truth: `mobile/version.json` (currently `0.1.0`, channel `prototype`, `iosBuildNumber: 1`, `androidVersionCode: 1`).

---

## 4. Repository structure

```
florida-lotto-predictor/
├── README.md                      ← this file
├── AGENTS.md                      ← top-level Codex/agent guidance (always-on)
├── package.json                   ← root workspace + scripts (dev/build/check/test)
├── pnpm-workspace.yaml            ← workspaces: client, mobile, server, shared
├── pnpm-lock.yaml
├── tsconfig.json                  ← root TS config (covers client/, server/, shared/)
├── vite.config.ts                 ← web client bundler
├── vitest.config.ts               ← server tests
├── render.yaml                    ← Render IaC reference (manual-deploy + cron)
├── drizzle.config.ts              ← Drizzle Kit config
├── .env.example                   ← server-side env template
│
├── .github/
│   └── workflows/
│       ├── ci.yml                 ← lint / type-check (root + mobile) / test / build
│       └── eas-update.yml         ← auto-publish OTA on push to main when mobile/** changes
│
├── .cursor/
│   └── rules/
│       └── git-verification.mdc   ← always-on agent rule (commit/push/report SHA)
│
├── docs/
│   ├── DEPLOYMENT.md              ← Render env-var reference
│   ├── AGENT_ONBOARDING.md        ← short agent-specific onboarding (read this if you are an AI agent)
│   ├── incidents/
│   │   └── 2026-05-02-prediction-learning-metrics-missing.md
│   └── runbooks/
│       ├── ota-mobile-update.md   ← how to publish an OTA mobile update
│       └── health-checks.md       ← /healthz, /health, known log patterns
│
├── client/                        ← Vite + React web client
│   └── src/
│
├── server/                        ← Node + tRPC backend
│   ├── _core/                     ← entry point, process handlers
│   │   └── index.ts               ← `pnpm dev` / `pnpm start` entry
│   ├── routers/                   ← tRPC routers (composed into AppRouter)
│   ├── predictions/               ← ensemble pipeline, model registry
│   ├── services/                  ← data ingestion, learning, scoring services
│   ├── db/                        ← Drizzle table objects + DB client wiring
│   ├── lib/                       ← rate limiter, helpers
│   ├── db.ts                      ← DB read helpers + safe fallbacks (← incident-hardened)
│   ├── cron.ts / cron-runner.ts   ← scheduled draw ingestion
│   └── *.test.ts                  ← Vitest specs co-located with source
│
├── shared/                        ← shared types + constants (used by client AND mobile)
│   ├── index.ts                   ← public surface
│   ├── lottery.ts                 ← FLORIDA_GAMES, GAME_TYPES, GameType
│   ├── modelMetadata.ts
│   ├── const.ts
│   ├── types.ts
│   └── _core/errors.ts
│
├── drizzle/                       ← schema + migrations
│   ├── schema.ts                  ← single source of truth for table shapes
│   ├── relations.ts
│   ├── 0000_*.sql … 0012_prediction_learning_metrics.sql
│   └── meta/                      ← Drizzle Kit snapshots
│
└── mobile/                        ← Expo React Native app
    ├── App.tsx                    ← root: providers, navigator, OTA orchestration  (← do not break)
    ├── app.config.ts              ← Expo runtime config; bakes commit SHA into `extra` for build-identity strip
    ├── app.json                   ← static Expo config
    ├── eas.json                   ← EAS Build profiles → channels (development/preview/production)
    ├── version.json               ← mobile version source of truth (do not bump from app.config.ts)
    ├── package.json               ← mobile workspace deps
    ├── tsconfig.json              ← extends expo/tsconfig.base
    ├── AGENTS.md                  ← mobile-specific Codex guidance (design direction, validation cmds)
    ├── index.ts                   ← Expo entry
    └── src/
        ├── lib/
        │   ├── env.ts                  ← API_URL, EXPO_PUBLIC_API_URL fallback
        │   ├── trpc.ts                 ← tRPC client + timeout wrapper
        │   ├── QueryProvider.tsx       ← TanStack Query + tRPC provider
        │   ├── authSession.tsx         ← React context for auth state
        │   ├── mobileAuthToken.ts      ← session token storage (expo-secure-store)
        │   ├── savedPicksStorage.ts    ← AsyncStorage CRUD + Export/Import (← persistence)
        │   ├── SavedPicksProvider.tsx  ← React context wrapper around storage   (← persistence)
        │   ├── ticketGrading.ts        ← grade saved picks against draw results
        │   ├── ticketImport.ts         ← parse manually entered tickets
        │   ├── ticketUpload.ts         ← upload ticket image for OCR scan
        │   ├── predictionSignals.ts    ← signal-stack helpers for analyze view
        │   ├── modelDescriptions.ts    ← human copy for model registry
        │   ├── version.ts              ← mobile build version helpers
        │   ├── buildIdentity.ts        ← runtime version + update id + commit sha   (← OTA)
        │   └── updates.ts              ← fetchPendingUpdate / applyPendingUpdate    (← OTA)
        ├── components/
        │   ├── ui.tsx                  ← Card, PrimaryButton, Chip, NumberChip, ui tokens, etc.
        │   └── UpdatePrompt.tsx        ← user-facing OTA modal                     (← OTA)
        ├── screens/
        │   ├── AnalyzeScreen.tsx       ← live model analysis + build-identity strip (← OTA-adjacent)
        │   ├── GenerateScreen.tsx      ← generate + save picks
        │   ├── TrackScreen.tsx         ← saved-picks ledger + grading + Data export/import card
        │   └── ModelsScreen.tsx        ← model registry browser
        └── theme/                      ← colors, spacing tokens (re-exported via ui.tsx)
```

The four files marked `(← OTA)` plus `mobile/App.tsx`'s `useEffect` and the `<UpdatePrompt />` mount in the navigator constitute the **OTA orchestration**. Treat them as a unit. If you change one, sanity-check the others.

The two files marked `(← persistence)` plus the `florida-lotto-predictor.saved-picks.v1` AsyncStorage key are the **picks ledger**. The on-disk format is locked to `{ version: 1, picks: SavedPick[] }`; see [Section 7](#7-data-and-storage).

---

## 5. Local development setup

### Prerequisites

- Node.js 22.x (use `nvm`, `fnm`, or `volta`).
- pnpm 10.4.1 (`corepack enable && corepack use pnpm@10.4.1` is the cleanest path; the repo's `packageManager` field will be enforced in CI).
- For mobile: Expo Go app on a physical device, OR Android Studio / Xcode for emulators, OR a custom dev client built via `eas build --profile development`.

### First-time setup

```bash
git clone https://github.com/phlox1000/florida-lotto-predictor.git
cd florida-lotto-predictor
pnpm install
cp .env.example .env
# Fill DATABASE_URL, JWT_SECRET, OAUTH_SERVER_URL, VITE_APP_ID, OWNER_OPEN_ID.
# Optional: FORGE_API_URL + FORGE_API_KEY for full LLM analysis (data-driven fallback if unset).
```

`docs/DEPLOYMENT.md` documents every server env var with required/optional/legacy groupings.

### Running the web + server stack

```bash
pnpm dev          # tsx watch over server/_core/index.ts; serves API + Vite-built client
pnpm check        # tsc --noEmit
pnpm test         # vitest run
pnpm build        # vite build + esbuild server bundle (dist/)
```

### Running the mobile app

All Expo / EAS commands run from the `mobile/` directory unless you've explicitly scoped a `pnpm --filter mobile` command.

```bash
cd mobile

# Option A: Expo Go (fastest iteration, no native modules requiring custom builds)
pnpm start                 # opens Expo dev server; scan QR with Expo Go
pnpm android               # if you have an emulator or USB device
pnpm ios                   # macOS only

# Option B: dev client (required if you've added native modules)
eas build --profile development --platform android
# Install resulting APK on device, then:
pnpm start --dev-client
```

Some packages used in this repo (e.g. `expo-secure-store`, `expo-updates`, `expo-file-system`'s native modules) won't fully exercise inside Expo Go — the dev-client flow is needed for parity with production.

### Pointing the mobile client at a different server

`mobile/.env` defines the API base URL via `EXPO_PUBLIC_API_URL`. To run against a local server:

```bash
# in mobile/.env
EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:5173
# or if using ngrok/tunneling:
EXPO_PUBLIC_API_URL=https://<your-ngrok-domain>.ngrok.io
```

Restart the Expo dev server after changing `.env` — Metro caches env reads. The default falls back to the production URL `https://florida-lotto-predictor.onrender.com`, so an unset value does not break the app, it just talks to prod.

### Mobile validation commands

The smallest useful set when you've changed mobile code:

```bash
pnpm exec expo config --json                  # validates app.config.ts evaluates
pnpm --filter mobile exec tsc --noEmit --types node    # type check (CI uses this exact command)
npx expo-doctor@latest                        # peer-dep + Expo SDK consistency check
```

`--types node` matters: `mobile/tsconfig.json` extends `expo/tsconfig.base` which does not pull Node types, but server files re-exported via `import type` (e.g. `server/lib/rateLimiter.ts` referencing `NodeJS.Timeout.unref`) need them. Without `--types node` you get false-positive errors on perfectly fine code.

### Common local-dev troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm install --frozen-lockfile` fails with version mismatch | `package.json` was edited without re-running install | `pnpm install` to regenerate the lockfile, then commit `pnpm-lock.yaml`. |
| `Cannot find module 'expo-constants'` (or any expo-* package) on CI | Dependency is transitively available locally (Windows hoisting) but not declared as a direct dep — Linux CI's stricter linker fails | Add it to `mobile/package.json` via `pnpm exec expo install <package>`. This is exactly what bit PR #54 with `expo-constants`. |
| `expo-doctor` complains about peer dep mismatches you didn't introduce | Stale `mobile/node_modules` after dep change | `rm -rf mobile/node_modules && pnpm install` |
| Mobile tsc error "Property X does not exist on type" but the file looks fine | Missing `--types node` flag | Re-run `pnpm exec tsc --noEmit --types node` from `mobile/`. Use the canonical command, not bare `tsc`. |
| Expo Go app shows the wrong API URL | Metro cached the old `EXPO_PUBLIC_API_URL` | Stop Metro (`Ctrl+C`), restart with `pnpm start --clear`. |
| `eas build` succeeds but the resulting APK can't reach the server | Device on a different network than the dev machine, or `EXPO_PUBLIC_API_URL` was set to a LAN IP | Ship preview/production builds with the public Render URL baked in; only override for local dev. |
| `predictions.generate` errors with `INTERNAL_SERVER_ERROR` in production | Could be the `prediction_learning_metrics` table missing (now fallback-handled) OR a real bug | Hit `/healthz`, check Render logs for `[predictions] prediction_learning_metrics missing`. If that's the only complaint, server is healthy and the fallback is working. |

---

## 6. Build and deployment

### Web + server (Render)

The server is deployed as a Render Web Service plus a separate Render Cron Job. Service IDs and the canonical config are checked into `render.yaml` as reference IaC. Important Render facts:

- **Auto-deploy is OFF.** `autoDeployTrigger: "off"` in `render.yaml`. Merging to `main` does **not** roll out the new code. After every server-affecting merge: open the Render dashboard → web service → "Manual Deploy" → "Deploy latest commit". This is intentional — it forces a human checkpoint where any new migration step can be staged before code that depends on it goes live.
- **Health check gating.** `healthCheckPath: /healthz`. New containers only receive traffic once they return 200 from `/healthz`, enabling true zero-downtime rollouts and auto-rollback on a failing new container.
- **Scaled to 2 instances.** Rate-limit state lives in Redis so multiple pods don't undercount.
- **pnpm pinned in build command.** `npm install -g pnpm@10.4.1 && pnpm install && pnpm build` — matches `packageManager` in root `package.json`.

After redeploy, hit `/healthz` and `/health` and confirm `uptime` is small (< ~30 s) to verify the new process is the one serving traffic. See [`docs/runbooks/health-checks.md`](./docs/runbooks/health-checks.md).

### Mobile (EAS Build + Expo Updates OTA)

`mobile/eas.json` defines three build profiles, each with a matching Expo Updates channel:

| Profile | Channel | Distribution | Purpose |
|---|---|---|---|
| `development` | `development` | internal | Dev-client APKs for local iteration. |
| `preview` | `preview` | internal | Internal release-mode APKs for testing the production build path before promoting. |
| `production` | `production` | (Play Store, future) | Auto-increments build number; intended for store distribution. |

A new APK is only built when the native layer changes (new package with native module, version bump, etc.). For pure-JS changes the OTA pipeline ships them in seconds without rebuilding:

```bash
cd mobile
pnpm exec eas update --branch <channel> --message "<short description>"
```

`.github/workflows/eas-update.yml` runs this automatically on every push to `main` that touches `mobile/**`, publishing to the `production` channel. It requires the `EXPO_TOKEN` repo secret to be set — see [`docs/runbooks/ota-mobile-update.md`](./docs/runbooks/ota-mobile-update.md) for the one-time setup and full workflow.

A worked example of a manual OTA from a maintainer's machine:

```bash
$ cd mobile
$ eas whoami
phlox1000

$ eas channel:list
production    runtimeVersion 0.1.0   created 2026-04-19   1 update
preview       runtimeVersion 0.1.0   created 2026-04-19   0 updates
development   runtimeVersion 0.1.0   created 2026-04-19   0 updates

$ eas update --branch production --message "Track: add Data export/import card"
✔ Compiled bundle
✔ Uploaded asset bundle
✔ Created update group: 5e0b... → channel "production"  runtimeVersion 0.1.0

# On the device, kill + reopen the app. Within ~5 seconds:
# 1. The UpdatePrompt modal shows "Update available" with "Update Now" and "Later".
# 2. Tap "Update Now" → app reloads on the new bundle.
# 3. Verify on the Analyze screen: build-identity strip should now read
#    `rv 0.1.0 · id 5e0b…  · sha <new-sha>` instead of `id embedded`.
```

If `eas channel:list` shows zero channels (older APKs), the device cannot receive OTA at all and must be rebuilt + reinstalled once via `eas build --platform android --profile preview`. After the one-time reinstall, every subsequent JS change ships OTA.

> **Critical caveat.** OTA only reaches a device whose installed APK has matching `runtimeVersion` and a matching `channel`. APKs built before the `expo-updates` integration was added (PR #52) cannot receive OTA updates and must be rebuilt + reinstalled once. Same applies whenever `runtimeVersion` policy or `version` changes. After the one-time rebuild, every subsequent JS change ships OTA.

The full troubleshooting flow lives in [`docs/runbooks/ota-mobile-update.md`](./docs/runbooks/ota-mobile-update.md). Read it before publishing OTA updates the first time.

---

## 7. Data and storage

### Server (MySQL)

- **DB:** Railway-hosted MySQL 9.4 (single instance).
- **ORM:** Drizzle. Schema is the single source of truth in `drizzle/schema.ts`; SQL migrations are checked in under `drizzle/0000_*.sql … 0012_*.sql`.
- **Migration discipline:** Migrations are applied **manually** out-of-band (via DBeaver / Railway console) — there is no auto-migrate on server boot. This is deliberate; see the 2026-05-02 incident for what schema drift looks like in production.
- **Always-safe reads:** `server/db.ts` wraps reads against personalization tables (notably `prediction_learning_metrics`) in a try/catch that detects missing-table errors via `errno === 1146` and returns empty results rather than throwing. Do **not** remove this fallback. It is a permanent safety net for code-vs-schema drift.

### Mobile (AsyncStorage)

The mobile app keeps a local picks ledger so the user has agency over their saved picks even when offline.

- **Key:** `florida-lotto-predictor.saved-picks.v1`
- **Schema:** `{ version: 1, picks: SavedPick[] }`
- **Type:** `SavedPick` defined in [`mobile/src/lib/savedPicksStorage.ts`](./mobile/src/lib/savedPicksStorage.ts). Includes game type, model name, main + special numbers, confidence, status (`pending` / `graded` / `reviewed` / `won` / `lost`), grading fields, source type (`generated` / `manual` / `importedPdf` / `uploadedImage`), and source provenance fields.
- **Dedup key:** `createPickKey(pick)` in the same file — used for both save-time dedup (no duplicate save) and import-time dedup (merge skips picks already in the ledger).
- **Provider:** [`mobile/src/lib/SavedPicksProvider.tsx`](./mobile/src/lib/SavedPicksProvider.tsx) is the React Context layer; persistence happens automatically via a `useEffect` that writes whenever `savedPicks` state changes.

### Backup and migration (Export/Import)

The mobile app's Track screen has a Data card with **Export Picks** and **Import Picks** buttons (added in PR #55):

- **Export** writes `florida-lotto-picks-export-YYYY-MM-DD.json` to the app's document directory and opens the system share sheet so the user can save it to Files / Drive / email. Same-day re-export overwrites.
- **Import** opens the document picker (JSON only), then prompts Merge (default, dedup via `createPickKey`) or Replace all (destructive, second confirmation required).
- File format on disk: `{ version: 1, exportedAt: <ISO>, picks: SavedPick[] }`. The importer also accepts a raw `[SavedPick]` array fallback.

A representative `SavedPick` looks like this on disk (one entry from the `picks` array):

```json
{
  "id": "k7n2vq3",
  "savedAt": "2026-05-04T18:21:09.421Z",
  "gameType": "powerball",
  "gameName": "Powerball",
  "modelName": "ensemble-v3",
  "mainNumbers": [4, 17, 28, 41, 52],
  "specialNumbers": [11],
  "confidenceScore": 0.62,
  "status": "graded",
  "notes": "",
  "sourceContext": "local",
  "sourceType": "generated",
  "sourceLabel": null,
  "importedAt": null,
  "originalFileName": null,
  "drawDate": "2026-05-04",
  "drawLabel": "evening",
  "mainMatchCount": 2,
  "specialMatchCount": 0,
  "matchedMainNumbers": [17, 41],
  "matchedSpecialNumbers": [],
  "gradeSummary": "2/5 main, 0/1 special",
  "prizeTierLabel": null,
  "gradedAt": "2026-05-04T22:14:58.103Z",
  "lastCheckedAt": "2026-05-04T22:14:58.103Z",
  "drawResultId": 1842,
  "drawResultDate": 1746389700000,
  "drawResultLabel": "PB Mon 2026-05-04",
  "resultSource": "official"
}
```

Every field is normalized through `normalizeSavedPick` on read. A pick missing required fields (gameType, gameName, modelName, at least one main number, finite confidence score) is dropped silently rather than throwing — this is what makes the importer tolerant of partially-corrupt files.

> **Hard constraint.** Do not change the `florida-lotto-predictor.saved-picks.v1` storage format. Backward compatibility for v1 is mandatory because installed APKs in the wild cannot be migrated until they update — and as documented in [Section 9](#9-common-gotchas-read-this-before-debugging), some installed APKs cannot receive OTA at all. If the format ever needs to change, write a migration that reads v1, writes v2, and supports both during a transition window measured in months.

---

## 8. CI/CD and quality gates

### GitHub Actions

`.github/workflows/ci.yml` runs on every PR and on every push to `main`. It performs:

1. `pnpm install --frozen-lockfile` — fails fast if `package.json` was changed without regenerating `pnpm-lock.yaml`.
2. `pnpm check` — root `tsc --noEmit` over `client/`, `server/`, `shared/`.
3. `pnpm exec tsc --noEmit --types node` from `mobile/` — mobile workspace type check, with Node types enabled so server-cross-imports type-check correctly. **This is the gate that would have caught PR #37's 739 mobile TS errors before they reached `main`.**
4. `pnpm vitest run --passWithNoTests` — server tests (currently several dozen `*.test.ts` files in `server/`).
5. `pnpm build` — Vite build (web client) + esbuild server bundle. Catches issues that only surface at bundle time.

Plus `.github/workflows/eas-update.yml` runs on every push to `main` that touches `mobile/**`, auto-publishing an OTA update to the `production` channel (requires `EXPO_TOKEN` secret).

### Branch protection

Branch protection on `main` should require the `Lint, type-check, test, build` check before merge. <!-- TODO: verify this is actually configured server-side; the workflow exists but I cannot inspect repo settings from here -->

> **Hard constraint.** PRs that don't pass CI must not be merged. PR #37 once merged with 739 mobile TypeScript errors and contributed to a 12-hour production outage by blocking a critical fix from merging cleanly. The CI gate above exists specifically to prevent that class of incident; do not bypass it. See [Section 11](#11-incident-history).

### What runs locally

Use the smallest relevant set for the change. For mobile-only changes, [Section 5's mobile validation commands](#mobile-validation-commands) are usually enough. For server changes, also run `pnpm test`. For anything that touches both: `pnpm check && pnpm test && pnpm --filter mobile exec tsc --noEmit --types node`.

---

## 9. Common gotchas (read this before debugging)

- **APK reinstall destroys local data.** Picks live in AsyncStorage on the device; they are not server-backed (this is intentional for privacy). Use the in-app **Export Picks** before reinstalling. There is no other recovery path.
- **OTA only reaches APKs that have the OTA orchestration code.** The `mobile/App.tsx` `useEffect` calling `fetchPendingUpdate()`, plus `<UpdatePrompt />`, plus `expo-updates`, was added in PR #52. Any APK installed before that lands cannot receive OTA updates — it must be rebuilt and reinstalled once. After that one rebuild, every future JS change ships OTA.
- **Expo `allowBackup` defaults to false.** `adb backup` produces empty backups for this app on Android. `run-as <package>` only works against debuggable APKs, and the `preview` build profile is release mode (not debuggable). On Android 14+ even `run-as` is gated. Plan for data export from inside the app, not from the host OS.
- **Render auto-deploy is off.** Merging to `main` does **not** roll out server code. Click "Deploy latest commit" in the Render dashboard manually. <!-- TODO: verify this is still the case at time of read; setting could be flipped in dashboard -->
- **Cursor agents have lost work by not committing.** The `.cursor/rules/git-verification.mdc` rule forces explicit `git status`, `git log origin/<branch>..HEAD`, commit, push, and SHA report at the end of every task that modified files. Do not disable it. The 2026-05-02 outage was caused in part by multiple sessions reporting "fix implemented" with empty `git log origin/main..HEAD`.
- **AsyncStorage on Android 14+ is functionally inaccessible from outside the running app.** SQLite files live under the app's private data directory; the OS does not expose them to `adb pull` for non-debuggable APKs. This is the underlying reason the Export/Import flow exists in [Section 7](#7-data-and-storage).
- **`prediction_learning_metrics` table was missing in production until 2026-05-04.** The server falls back gracefully via try/catch around `getPredictionLearningMetrics` in `server/db.ts`. Do not remove the fallback — it's a permanent safety net for schema-vs-code drift, not a temporary workaround. The migration to actually create the table can be applied independently when convenient. <!-- TODO: verify if migration 0012 has been applied yet; if so, the fallback still stays but the warning log will go silent -->
- **`mobile/eas.json` declares an `eas-cli` floor of `>= 18.7.0`.** The version actually pinned in `mobile/package.json` is `^16.32.0`. <!-- TODO: confirm whether this mismatch causes EAS Build to refuse or whether it's tolerated; if it matters, decide which one to bump --> Until that's resolved, run EAS commands with `pnpm exec` so the workspace-pinned version is used rather than a globally-installed one.
- **`MANUS_*` env vars in `[startup] env check {...}` logs being `false` is expected.** They were never wired and aren't in active use; the OAuth code reads `OAUTH_SERVER_URL` (which is set). See [`docs/runbooks/health-checks.md`](./docs/runbooks/health-checks.md).
- **`mobile/.env` is checked in.** It only contains `EXPO_PUBLIC_API_URL` pointing at the public Render URL — that is not a secret. Do not add API keys or session tokens to that file; it ships to the device.
- **`mobile/florida-lotto-backup.ab` may exist locally.** It's an Android `adb backup` artifact from past data-recovery debugging and is in `.gitignore` patterns where applicable. Do not commit it.
- **Workspace name in `mobile/package.json` is `mobile`, not `@florida-lotto/mobile`.** But the shared workspace is `@florida-lotto/shared`. When filtering with `pnpm --filter`, the mobile workspace is `mobile` (no scope).

---

## 10. Multi-agent development workflow

This project is built using a mix of human direction and AI agents. Concretely:

- **Claude (Opus / Sonnet).** Architecture decisions, debugging long-tail production issues, multi-file refactors, incident analysis, post-mortem writing.
- **ChatGPT / Codex.** Narrow execution tasks where the spec is unambiguous and the diff is self-contained. Also used for second opinions on diagnoses. <!-- TODO: confirm Codex CLI usage pattern; this is the maintainer's stated workflow -->
- **Cursor (with the model the human picks per session).** File-level implementation in the IDE, with `.cursor/rules/` enforcing repo-wide invariants on every session.

The project's `.cursor/rules/` directory currently contains one rule:

| Rule | What it enforces |
|---|---|
| `git-verification.mdc` | Every task that modifies files must end with `git status`, `git log origin/<branch>..HEAD`, an explicit commit + push, and a final summary line stating the resulting SHA. Empty `git log` ≠ "implemented". This rule exists because of the 2026-05-02 outage. |

The two project-level `AGENTS.md` files (root and `mobile/`) are also always-applied and capture working priorities and design direction respectively.

### Recommended starting flow for a new agent session

1. Paste this README into the session (or reference it; some agent runtimes auto-attach it).
2. Read [`docs/AGENT_ONBOARDING.md`](./docs/AGENT_ONBOARDING.md) — short, agent-specific.
3. State the task with explicit scope, constraints, and success criteria.
4. Let the agent run. End with the git verification block from `git-verification.mdc`.

The single most important habit, based on past failures: every claim of "implemented" / "fixed" / "deployed" must be backed by a verifiable commit SHA on the remote branch. If `git log origin/<branch>..HEAD` is empty at the end of the task, nothing happened from the perspective of anyone reviewing the work.

### Example session prompt

A well-shaped task prompt for an agent in this repo looks like:

```
Add <feature> to <screen|module>.

Background: <one paragraph explaining why this matters and what's already in place>

Goals:
1. <concrete goal 1>
2. <concrete goal 2>
3. <optional polish, may be dropped if blocked — say so>

Constraints:
- Do not modify <list of files / surfaces that must not regress>.
- No new dependencies unless absolutely required (use `pnpm exec expo install`).
- All <risky operations> wrapped in try/catch.

Workflow:
1. Branch from latest main: `git fetch origin && git checkout -b <branch> origin/main`.
2. Implement the changes.
3. Verify `pnpm exec tsc --noEmit --types node` passes from `mobile/` (or `pnpm check && pnpm test` for server).
4. Commit in 2-3 logical chunks.
5. Push and open a PR.
6. Final report with commit SHAs, PR URL, files changed.

If anything blocks, stop and report. Do not silently work around constraint violations.
```

The structure matters more than the wording. Tasks shaped this way produce reliable PRs; tasks shaped as "make X work" produce drift.

### Reporting all task items, not just the first

When a prompt has multiple numbered tasks or sub-goals, complete all of them or explicitly state which were skipped and why. Silently dropping later items is one of the failure modes most likely to ship a half-done PR. If a sub-goal becomes infeasible mid-task, surface that decision in the PR description (and in the corresponding commit message) rather than letting it disappear.

### Asking clarifying questions

When the spec is ambiguous or contains a factual claim that contradicts the current state of the repo, **ask** before writing 600 lines that need to be redone. The spec author would rather answer one structured question than review code that solved the wrong problem. This README itself is an example: the original spec asserted "this repo is mobile-only" but the repo is in fact a full monorepo, and a 30-second clarifying exchange avoided producing a factually wrong document.

---

## 11. Incident history

### 2026-05-02 — `prediction_learning_metrics` outage (~12 hours)

Production `predictions.generate` failed for ~12 hours because the `prediction_learning_metrics` table existed in `drizzle/schema.ts` but had never been applied to the Railway MySQL database. Every call threw `ER_NO_SUCH_TABLE` (errno 1146).

**Root cause:** Schema drift between code and production.

**Compounding causes:**
1. PR #37 had merged with 739 TypeScript errors in the mobile workspace (no CI gate at the time), forcing a revert as a precondition for merging the fix cleanly.
2. Multiple agent sessions reported "fix implemented" with empty `git log origin/main..HEAD`. The fix sat in working trees across at least three sessions before any commit.
3. The user-facing error message in the Analyze screen swallowed the actual `INTERNAL_SERVER_ERROR` for hours.

**Mitigations now in place:**
- Permanent try/catch fallback in `server/db.ts` that catches errno 1146 (deep-walking `.cause` chains through Drizzle/mysql2 wrappers), returns `[]`, and logs once per process lifetime.
- CI gate enforcing `tsc --noEmit` on root and `tsc --noEmit --types node` on mobile (added PR #54).
- `.cursor/rules/git-verification.mdc` enforcing explicit commit + push + SHA report at end of every task (added PR #54).
- Build-identity strip and `code: <TRPC_CODE>` line on the mobile Analyze screen so a sideloaded user can see which bundle they're running and what the actual server error category is (added PR #52).
- OTA orchestration (`fetchPendingUpdate` / `UpdatePrompt`) so future server-side fixes can ship to installed APKs without a rebuild (added PR #52).

**Pattern to watch:** schema drift between code and production database. Specifically: when adding a new SELECT against a new table, either (a) gate on the migration being applied first, or (b) wrap the read in a fallback that returns an empty result on `ER_NO_SUCH_TABLE`. Option (b) is the default pattern in this codebase.

Full timeline, RCA, mitigations, and outstanding work: [`docs/incidents/2026-05-02-prediction-learning-metrics-missing.md`](./docs/incidents/2026-05-02-prediction-learning-metrics-missing.md).

---

## 12. Roadmap and known limitations

### Near-term

- **Re-author the Home dashboard.** The original mobile Home dashboard work lives on the `cursor/home-dashboard-mobile-1904` branch (preserved from the reverted PR #37). Before re-merging, the 739 mobile TS errors must be fixed and both `pnpm check` and `pnpm exec tsc --noEmit --types node` (from `mobile/`) must pass. The CI gate added in PR #54 will refuse the merge otherwise.
- **Apply the `prediction_learning_metrics` migration to Railway.** `drizzle/0012_prediction_learning_metrics.sql` exists; the live DB does not have the table. The fallback handles the absence safely, but personalization data will not populate until the table exists. Plan: validate the migration matches existing table conventions (utf8mb4 / utf8mb4_0900_ai_ci / InnoDB), apply via DBeaver in a transaction, verify with `SHOW CREATE TABLE`, commit. Do this in a calm scheduled session, not as fire-fighting work.
- **Migrate auth from residual Manus OAuth to self-contained email/password.** `drizzle/0009_add_password_fields.sql` already adds password fields; the server-side flow and mobile UI to use them are partial. <!-- TODO: confirm current implementation status of email/password auth path; some pieces are in tests (auth.login.test.ts etc.) but production may still rely on OAUTH_SERVER_URL --> The `MANUS_*` and `OAUTH_SERVER_URL` envs can be retired once email/password covers the same surface.
- **Set the `EXPO_TOKEN` repo secret if not already set.** Without it, `.github/workflows/eas-update.yml` cannot publish OTA updates automatically. <!-- TODO: verify whether EXPO_TOKEN is set; cannot inspect repo secrets from here -->

### Longer-term

- **Extract the prediction "brain" architecture into a portable package.** The ensemble pipeline, scoring layer, learning loop, and per-domain scoring interfaces in `server/predictions/` and `server/services/` are written specifically for Florida Lottery games. The medium-term intent is to factor those out into a reusable package that can serve any prediction problem with structured outcomes and observable feedback.
- **Define and enforce a per-domain scoring function interface.** A clean contract — input shape, output shape, error semantics, learning hook — would let the brain plug into other prediction problems (sports, financial, ops) without per-domain rewriting.

### Known limitations

- The mobile app is single-user (the maintainer's account). It is not designed for multi-tenant use.
- The picks ledger is device-local. Picks do not sync across devices. Export/Import is the only cross-device path. <!-- intentionally; a server-backed sync is not on the near-term roadmap -->
- LLM analysis depends on `FORGE_API_URL` / `FORGE_API_KEY`. When unset, the server returns a data-driven local summary instead of failing loudly. This is intentional but means the AI Analysis tab's content can change form silently if those vars are removed.
- Render is configured for `numInstances: 2` and Redis-backed rate limiting. If Redis is removed or misconfigured, rate-limit counts will undercount across pods.

---

## AI analysis (preserved from prior README)

The Analysis tab calls an LLM when `FORGE_API_KEY` (or a supported alias such as `BUILT_IN_FORGE_API_KEY` or `OPENAI_API_KEY`) is set. If the key is missing or the provider errors, the API returns a **local summary** derived from stored draws and model performance so users do not see raw configuration errors. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the full env-var migration table.

---

## License

MIT (see `package.json`).
