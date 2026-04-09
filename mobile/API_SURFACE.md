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

### Auth flow from mobile perspective

The current auth is **Manus OAuth + cookie-based sessions**:

1. **Login:** The web app redirects to the Manus OAuth provider. On callback (`/api/oauth/callback`), the server exchanges the code for a token, fetches user info, upserts the user in the DB, and sets a signed JWT in the `app_session_id` cookie (HttpOnly, 1-year expiry).

2. **Session verification:** On every `protectedProcedure` call, the server reads the `app_session_id` cookie from the request, verifies the JWT signature (HS256), and loads the user from the DB.

3. **Mobile challenge:** This flow is designed for browser-based cookie handling. React Native / Expo does not automatically manage cookies across HTTP requests. Mobile options:
   - **Option A (WebView login):** Open the OAuth flow in an in-app WebView, capture the session cookie from the callback, and attach it to all subsequent tRPC requests via a custom `fetch` that includes the cookie header.
   - **Option B (Token-based):** Add a new endpoint that returns the JWT directly in the response body (instead of a cookie) so the mobile client can store it in SecureStore and send it as a Bearer token or cookie header. This requires a small server-side change.
   - **Option C (API key):** For MVP, if only the owner uses Track, a simple API key could bypass OAuth. Not recommended for Play Store release.

4. **Recommendation:** Option A (WebView + cookie extraction) is the lowest-friction path that works with the existing server code. Option B is cleaner long-term but requires a server change.

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

### Cookie handling
The server authenticates via the `app_session_id` HttpOnly cookie. React Native's `fetch` does not handle cookies like a browser. The mobile tRPC client must explicitly manage the cookie header — either by extracting it from a WebView OAuth flow or by storing the JWT and injecting it manually.

### CORS
The server is Express-based and currently configured for the web frontend's origin. The mobile app makes requests from a non-browser context (no `Origin` header), so CORS middleware may need to be updated to allow requests without an origin, or the mobile client needs to set an accepted origin header. Test this early.

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
