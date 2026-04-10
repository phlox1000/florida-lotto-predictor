# Hardening Log

## Baseline — Established Before Any Changes

### TypeScript Compilation (`npx tsc --noEmit`)
- **Result:** PASS — zero errors

### Vitest (`npx vitest run`)
- **Result:** 3 test files failed | 20 passed (23 total)
- **Tests:** 7 failed | 342 passed (349 total)
- **Pre-existing failures:**
  - `server/offline-features.test.ts` — 4 failures (WhatsNew changelog component tests)
  - `server/ticket-scanner.test.ts` — 1 failure (ticketAnalytics null DB)
  - Other pre-existing test failures related to component content assertions

> These failures are pre-existing and unrelated to the hardening work below.

---

## Issue 1 — Remove time-based nondeterminism from predictions

Changes made to `server/predictions.ts`:
- **A.** `deterministicSeed()`: Removed `timeComponent` (Date.now()), replaced with `historyAnchor` derived from `currentPicks[0]`.
- **B.** `deterministicWeightedSelect()`: Removed `timeComponent`, now uses `salt` directly combined with item value.
- **C.** `frequencyBaselineModel()`: Replaced `Math.floor(Date.now() / 60000) % step` with `0`. Added stable fallback comment.
- **D.** `temporalEchoModel()`: Added INTENTIONAL comment above `new Date()` — left unchanged as designed.

New test added to `server/predictions.test.ts`: `runAllModels produces stable output for identical inputs`

| Check | Result |
|-------|--------|
| `npx vitest run server/predictions.test.ts` | PASS — 19 tests passed |
| `grep -n "Date.now()" server/predictions.ts` | Zero results |
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 2 — Fix special-number bug in budget ticket generation

Changes made:
- **A.** `server/predictions.ts` — Updated `selectBudgetTickets` signature to accept `history: HistoryDraw[] = []` as fifth parameter.
- **B.** `server/predictions.ts` — Replaced broken `allPredictions.length > 0 ? [] : []` with `history` in Phase 2 `generateSpecialFromHistory` call.
- **C.** `server/routers.ts` — Updated `selectBudgetTickets` call in `tickets.generate` to pass `history` as fifth argument.

New test added to `server/predictions.test.ts`: `selectBudgetTickets grounds special numbers in history`

| Check | Result |
|-------|--------|
| `npx vitest run server/predictions.test.ts` | PASS — 20 tests passed |
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 3 — Fix N+1 query in compare.drawDetail

Changes made to `server/routers.ts`:
- Replaced per-row `Promise.all(perfRows.map(async ...))` pattern with a single batched query using `inArray`.
- Added `inArray` to the drizzle-orm dynamic import.
- Built an in-memory `predMap` lookup from the batched result.
- Replaced async map with synchronous map using the lookup.
- Added `// BATCHED` comment above the batched fetch.
- Response shape is identical — field names unchanged.

| Check | Result |
|-------|--------|
| `grep -n ".map(async" server/routers.ts` | Line 777 only (unrelated GAME_TYPES map) — drawDetail section clean |
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 4 — Fix silent error swallowing in data fetch flows

Changes made:
- **`server/routers.ts` — `fetchLatest`:** Added `errors: string[]` array. Uses `insertResult.status` to distinguish duplicates from inserts. Uses `insertResult.insertId` instead of unsafe cast. Catch block now logs and collects real errors. Returns `errors` in response.
- **`server/routers.ts` — `fetchAll`:** Same pattern applied. Added `errors` array to return value.
- **`server/routers.ts` — `fetchHistory`:** Same pattern. Duplicates now counted via `insertResult.status === "duplicate"` instead of catch. Errors surfaced in return value.
- **`server/cron.ts` — `runAutoFetch`:** Uses `insertResult.status` to gate `newDraws++` and evaluation logic. Catch block now logs and pushes to `result.errors` and increments `gameResult.errors`.

All modified catch blocks include the comment: "Duplicates are handled via insertDrawResult's return status. Only genuine unexpected failures reach this catch block."

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 5 — Add transaction safety to evaluation writes

Changes made to `server/db.ts`:
- Wrapped the `insertModelPerformance` call inside `evaluatePredictionsAgainstDraw` with `db.transaction()`.
- Inside the transaction, replaced `insertModelPerformance(perfRecords)` with `tx.insert(modelPerformance).values(perfRecords)`.
- Added TRANSACTION comment explaining atomicity requirement.
- All read queries remain outside the transaction.
- Return shape `{ evaluated, highAccuracy }` preserved.
- Null guard for `db` preserved.

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 6 — Add missing database indexes

Created `drizzle/0008_performance_indexes.sql` with 5 indexes:
- `dr_game_date_idx` on `draw_results (gameType, drawDate)`
- `mp_model_game_idx` on `model_performance (modelName, gameType)`
- `mp_draw_idx` on `model_performance (drawResultId)`
- `p_game_created_idx` on `predictions (gameType, createdAt)`
- `p_user_idx` on `predictions (userId, createdAt)`

Updated `drizzle/meta/_journal.json` with new entry at idx 5, tag `0008_performance_indexes`.

No unique constraint added on `draw_results(gameType, drawDate, drawTime)` — application-level duplicate detection preserved as instructed.

| Check | Result |
|-------|--------|
| `ls drizzle/0008_performance_indexes.sql` | File exists |
| `npx tsc --noEmit` | PASS — zero errors |

---

## Final Verification

| # | Check | Result |
|---|-------|--------|
| 1 | `npx tsc --noEmit` | PASS — zero errors |
| 2 | `npx vitest run` | 3 failed / 20 passed (23 files); 7 failed / 344 passed (351 tests). All failures are **pre-existing** (same 3 files, same 7 tests as baseline). The 2 new tests from Issues 1 and 2 both pass. Net new test count: +2 (from 342 to 344 passing). |
| 3 | `grep -n "Date.now()" server/predictions.ts` | Zero results |
| 4 | `grep -n ".map(async" server/routers.ts \| grep -i "prediction"` | Zero results |
| 5 | `ls drizzle/0008_performance_indexes.sql` | File exists |

All 5 verification checks pass.
