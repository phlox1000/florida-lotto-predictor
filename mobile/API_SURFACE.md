# Mobile MVP API Surface

Reference for all tRPC endpoints the mobile app needs, mapped to the
four tabs defined in `MVP_BASELINE.md`.

Server base URL: the Render-hosted backend (same API the web client uses).
Transport: tRPC over HTTP (batch-enabled).
Package name for shared types: `@florida-lotto/shared`

---

## Tab 1 — Analyze

### `schedule.next` (query)
- **Auth:** `publicProcedure` — no auth required
- **Input:** `{ gameType: GameType }` where `GameType` is one of the 9 enum values in `GAME_TYPES`
- **Response fields the UI consumes:**
  - `gameName: string`
  - `nextDraw: string | null` (ISO 8601 timestamp)
  - `countdown: string` (e.g. `"2h 15m"`, `"Drawing now!"`, `"Game ended"`)
  - `schedule: DrawSchedule` (drawDays, drawTimes, ended, description)
- **Mobile notes:** Countdown string is computed server-side at request time. The mobile client should poll or refresh on tab focus rather than relying on a stale value.

### `schedule.all` (query)
- **Auth:** `publicProcedure`
- **Input:** none
- **Response:** Array of schedule objects for all 9 games (same fields as `schedule.next` plus `ticketPrice`).
- **Mobile notes:** Good for populating the game selector dropdown in one call.

### `draws.byGame` (query)
- **Auth:** `publicProcedure`
- **Input:** `{ gameType: GameType, limit?: number }` (limit 1-200, default 50)
- **Response fields:** Array of draw result rows: `{ id, gameType, drawDate, mainNumbers: number[], specialNumbers: number[], drawTime, source }`
- **Mobile notes:** Use `limit: 1` to get just the last draw result for display.

### `predictions.generate` (mutation)
- **Auth:** `publicProcedure` (persists predictions only if user is logged in)
- **Input:** `{ gameType: GameType, sumRangeFilter?: boolean }` (default false)
- **Response fields:**
  - `predictions: PredictionResult[]` — each has `modelName`, `mainNumbers`, `specialNumbers`, `confidenceScore`, `metadata`
  - `gameName: string`
  - `weightsUsed: boolean`
  - `sumRangeFilterApplied: boolean`
- **Rate limit:** 10 requests per minute per IP
- **Mobile notes:** This is a mutation (POST), not a query. Rate-limited — show the user a cooldown indicator if they hit the limit. Response includes all 18 models; the mobile UI should display the top picks (highest confidence) rather than all 18.

### `patterns.analyze` (query)
- **Auth:** `publicProcedure`
- **Input:** `{ gameType: GameType, lookback?: number }` (10-500, default 100)
- **Response fields:**
  - `frequency: Array<{ number, count, percentage }>` — sorted by count desc
  - `streaks: Array<{ number, currentStreak, streakType: "hot"|"cold", maxHotStreak, maxColdStreak }>`
  - `overdue: Array<{ number, drawsSinceLastAppearance, averageGap }>`
  - `pairs: Array<{ numberA, numberB, count, percentage }>` — top 20
  - `specialFrequency: Array<{ number, count, percentage }>` (only for games with special numbers)
  - `drawCount: number`
- **Mobile notes:** For MVP, only the hot/cold indicators are needed. Use `streaks` array filtered to the top 5 hot and top 5 cold numbers. The full `frequency`/`overdue`/`pairs` data can be ignored for MVP.

---

## Tab 2 — Generate

### `predictions.generate` (mutation)
Same endpoint as Tab 1. See above.

### `predictions.quickPick` (mutation)
- **Auth:** `publicProcedure`
- **Input:** `{ gameType: GameType, count?: number }` (1-20, default 5)
- **Response fields:**
  - `picks: Array<{ mainNumbers: number[], specialNumbers: number[] }>`
  - `gameName: string`
- **Mobile notes:** Pure random — no model weighting. Good for the "Quick Pick" button.

### `tickets.generate` (mutation)
- **Auth:** `publicProcedure` (persists selection only if logged in)
- **Input:** `{ gameType: GameType, budget?: number, maxTickets?: number }` (budget 1-75, default 75; maxTickets 1-20, default 20)
- **Response fields:**
  - `tickets: Array<{ mainNumbers, specialNumbers, modelSource, confidence, playTonightScore, scoreBreakdown }>` — scored and ranked
  - `totalCost: number`
  - `gameName: string`
  - `ticketPrice: number`
- **Rate limit:** 10 requests per minute per IP
- **Mobile notes:** This is the "Smart generation (model-weighted predictions)" endpoint. Each ticket includes a `modelSource` label for the UI. Budget and maxTickets map directly to the MVP's "$75 / 20 tickets" constraint.

---

## Tab 3 — Track

**All Track endpoints require authentication (`protectedProcedure`).**

### `tracker.logPurchase` (mutation)
- **Auth:** `protectedProcedure`
- **Input:**
  ```
  {
    gameType: GameType,
    mainNumbers: number[],
    specialNumbers?: number[],
    purchaseDate: number,       // epoch ms
    drawDate?: number,          // epoch ms
    cost: number,               // min 0
    notes?: string,
    modelSource?: string
  }
  ```
- **Response:** `{ success: true, id: number }`

### `tracker.list` (query)
- **Auth:** `protectedProcedure`
- **Input:** `{ limit?: number }` (1-200, default 100)
- **Response:** Array of purchased ticket rows with all fields including `outcome`, `winAmount`, `mainHits`, `specialHits`.

### `tracker.updateOutcome` (mutation)
- **Auth:** `protectedProcedure`
- **Input:** `{ id: number, outcome: "pending"|"loss"|"win", winAmount?: number, mainHits?: number, specialHits?: number }`
- **Response:** `{ success: true }`

### `tracker.delete` (mutation)
- **Auth:** `protectedProcedure`
- **Input:** `{ id: number }`
- **Response:** `{ success: true }`

### `tracker.stats` (query)
- **Auth:** `protectedProcedure`
- **Input:** none
- **Response:** ROI summary stats (total spent, total won, net, win rate, etc.)

### `tracker.statsByGame` (query)
- **Auth:** `protectedProcedure`
- **Input:** none
- **Response:** ROI broken down by game type.

---

## Tab 4 — Models

### `leaderboard.all` (query)
- **Auth:** `publicProcedure`
- **Input:** none
- **Response fields:**
  - `totalEvaluations: number`
  - `models: Array<{ modelName, totalEvaluated, avgMainHits, avgSpecialHits, maxMainHits, totalMainHits, totalSpecialHits, perfectMatches, zeroMatches, hitRate, consistency, compositeScore, gameBreakdown: Array<{ gameType, total, avgHits, maxHits }> }>`
  - Models are pre-sorted by `compositeScore` descending.

### `leaderboard.byGame` (query)
- **Auth:** `publicProcedure`
- **Input:** `{ gameType: GameType }`
- **Response fields:**
  - `gameType: string`
  - `models: Array<{ modelName, totalEvaluated, avgMainHits, avgSpecialHits, maxMainHits }>`
  - Models are pre-sorted by `avgMainHits` descending.

### `performance.stats` (query)
- **Auth:** `publicProcedure`
- **Input:** `{ gameType: GameType }`
- **Response:** Raw model performance stats array for a single game.

---

## Auth Requirements

### Which tabs work without auth
- **Tab 1 (Analyze):** Fully public. All endpoints are `publicProcedure`.
- **Tab 2 (Generate):** Fully public. Predictions are generated without auth. If the user IS logged in, predictions and ticket selections are persisted to their history — but this is invisible to the UI.
- **Tab 4 (Models):** Fully public. Leaderboard and performance data are `publicProcedure`.

### Which tabs require auth
- **Tab 3 (Track):** Every endpoint is `protectedProcedure`. The user must be authenticated before any Track functionality works.

### Mobile Auth Flow

The backend supports both cookie-based auth (web) and Bearer token auth (mobile). The mobile app uses `expo-auth-session` to complete the OAuth flow, then exchanges the code for a JWT via a dedicated endpoint.

#### Step-by-step flow

1. **Initiate OAuth:** The mobile app opens the system browser via `expo-auth-session` with the Manus OAuth provider URL, passing `redirect_uri` pointing back to the Expo app (e.g. `exp://...` or a custom scheme).

2. **User authenticates:** The user logs in via the OAuth provider (Google, email, etc.) in the system browser.

3. **Receive code:** The OAuth provider redirects back to the app with `code` and `state` query parameters. `expo-auth-session` captures these.

4. **Exchange code for token:** The mobile app calls:
   ```
   POST /api/auth/mobile-token
   Content-Type: application/json
   Body: { "code": "<oauth-code>", "state": "<oauth-state>" }
   ```
   **Response (200):**
   ```json
   {
     "token": "<signed-jwt>",
     "user": { "id": 1, "name": "...", "email": "...", "role": "user" }
   }
   ```
   **Error responses:** 400 (missing code/state), 500 (exchange failed).

5. **Store the token:** Save the JWT in `expo-secure-store`. This is encrypted device storage that persists across app restarts.

6. **Attach to all requests:** Configure the tRPC client's custom `fetch` or `headers` to include:
   ```
   Authorization: Bearer <stored-jwt>
   ```
   This header is checked by the server if no session cookie is present.

7. **Token lifetime:** The JWT is valid for 1 year (same as the web cookie). The mobile app does not need to refresh it.

#### What stays unchanged

The web app continues using the existing `/api/oauth/callback` route which sets the `app_session_id` cookie. The server checks the cookie first, then falls back to the `Authorization: Bearer` header. Both paths use the same JWT format and verification logic.

---

## Not Needed for MVP

These endpoints exist in `routers.ts` but are explicitly out of scope per `MVP_BASELINE.md`:

| Endpoint | Router | Why excluded |
|---|---|---|
| `wheel.generate` | wheel | Number wheel generator — out of scope |
| `wheel.smartNumbers` | wheel | Number wheel generator — out of scope |
| `favorites.list` | favorites | Favorites management — out of scope |
| `favorites.add` | favorites | Favorites management — out of scope |
| `favorites.remove` | favorites | Favorites management — out of scope |
| `favorites.use` | favorites | Favorites management — out of scope |
| `export.ticketsPdf` | export | Export to PDF — out of scope |
| `analysis.generate` | analysis | AI/LLM analysis — out of scope |
| `patterns.heatmap` | patterns | Full heatmap view — out of scope |
| `compare.results` | compare | Compare view — out of scope |
| `compare.drawDetail` | compare | Compare view — out of scope |
| `leaderboard.headToHead` | leaderboard | Head-to-head comparison — out of scope |
| `leaderboard.trends` | leaderboard | Model trend charts — out of scope |
| `leaderboard.affinity` | leaderboard | Model game affinity tags — out of scope |
| `leaderboard.streaks` | leaderboard | Model prediction streaks — out of scope |
| `leaderboard.backfill` | leaderboard | Admin backfill — out of scope |
| `push.*` | push | Push notifications — out of scope |
| `csvExport.*` | csvExport | CSV export — out of scope |
| `dataFetch.triggerAutoFetch` | dataFetch | Admin-only data fetch — out of scope |
| `dataFetch.fetchLatest` | dataFetch | Admin-only data fetch — out of scope |
| `dataFetch.fetchAll` | dataFetch | Admin-only data fetch — out of scope |
| `dataFetch.fetchHistory` | dataFetch | Admin-only bulk history — out of scope |
| `dataFetch.pdfUploads` | dataFetch | PDF upload history — out of scope |
| `draws.add` | draws | Admin manual draw entry — out of scope |
| `tickets.history` | tickets | Ticket selection history — out of scope |
| `tickets.ticketAnalytics` | tickets | Ticket scanner analytics — out of scope |
| `predictions.history` | predictions | Prediction history — out of scope |
| `tracker.logBulkPurchase` | tracker | Bulk ticket logging — out of scope |

---

## Mobile-Specific Concerns

### Auth token handling
The server now accepts `Authorization: Bearer <jwt>` as a fallback when no session cookie is present. The mobile app should store the JWT from `/api/auth/mobile-token` in `expo-secure-store` and attach it to every request. No cookie management needed.

### CORS
The server has no explicit CORS middleware. Mobile apps make direct HTTP requests (not browser requests), so CORS is not enforced. No server changes needed.

### Rate limiting
`predictions.generate` and `tickets.generate` are rate-limited to 10 requests per minute per IP. The rate limiter uses `req.ip` or `x-forwarded-for`. On mobile networks, IP addresses change frequently (cell tower hops, WiFi/cell switches). This is generally fine — the limit is per IP, so a changing IP resets the counter. But on shared WiFi (e.g., airport), multiple users could share an IP and exhaust the limit faster.

### File uploads
Not needed for MVP. The existing PDF upload endpoints use `multipart/form-data` which would need special handling in React Native if added later.

### Date handling
All dates from the server are either ISO 8601 strings (`nextDraw`) or epoch milliseconds (`drawDate`, `purchaseDate`). The mobile client should parse these consistently. The `countdown` field is a pre-formatted string — display it directly.

### Payload size
`predictions.generate` returns all 18 model predictions. On slow mobile connections, this is a moderate payload. Consider rendering a loading skeleton. `leaderboard.all` can also be large if many evaluations exist (includes per-game breakdown for every model).

### Offline behavior
Out of scope for MVP, but worth noting: all endpoints require network access. The mobile app should show clear "no connection" states rather than failing silently.

### tRPC client setup
The web app uses `@trpc/react-query`. The mobile app should use the same stack (`@trpc/client` + `@tanstack/react-query`) with Expo. The shared type router (`AppRouter`) can be imported directly from the server code via the workspace protocol — this is why Phase 1 set up pnpm workspaces.
