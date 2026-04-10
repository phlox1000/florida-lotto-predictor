# Followup Fix Log

## Baseline — Established Before Any Changes

### TypeScript Compilation (`npx tsc --noEmit`)
- **Result:** PASS — zero errors

### Vitest (`npx vitest run`)
- **Result:** 3 test files failed | 20 passed (23 total)
- **Tests:** 7 failed | 344 passed (351 total)

### Failing Tests (Baseline)

| # | File | Test Name | Root Cause |
|---|------|-----------|------------|
| 1 | server/offline-features.test.ts | WhatsNew changelog component > defines a CHANGELOG array with version entries | Test asserts raw source text patterns; component was rewritten to JSX |
| 2 | server/offline-features.test.ts | WhatsNew changelog component > has a ChangelogEntry interface with version, date, title, changes | Same — stale text assertions |
| 3 | server/offline-features.test.ts | WhatsNew changelog component > supports feature, improvement, and fix change types | Same — stale text assertions |
| 4 | server/offline-features.test.ts | WhatsNew changelog component > only shows modal when version is newer than last seen | Same — stale text assertions |
| 5 | server/offline-features.test.ts | WhatsNew changelog component > includes multiple version entries in the changelog | Same — stale text assertions |
| 6 | server/h2h-consensus.test.ts | Version 4.4.0 > service worker matches v4.4.0 | Stale version assertion |
| 7 | server/ticket-scanner.test.ts | Ticket Scanner & Analytics > ticketAnalytics returns expected shape for authenticated user | `getTicketAnalytics` lacks null guard for db — crashes on `db!.select()` |

---

## Issue 1 — Align model identity ("random" vs "frequency_baseline")

Changes made:
- **shared/lottery.ts:** Replaced `"random"` with `"frequency_baseline"` in `MODEL_NAMES` array.
- **client/src/pages/HeadToHead.tsx:** Renamed `random` key to `frequency_baseline` in `MODEL_DISPLAY`. Added `random` as legacy compatibility key. Added legacy comment.
- **client/src/pages/Leaderboard.tsx:** Added `frequency_baseline` key to `MODEL_DISPLAY_NAMES`, `MODEL_CATEGORIES`, and `MODEL_COLORS`. Kept `random` as legacy compatibility key in all three maps. Added legacy comment.

Remaining `"random"` references are:
- Legacy compatibility keys in HeadToHead.tsx and Leaderboard.tsx (marked with comments)
- Test files using `"random"` as test data values (not model identity — unrelated)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| HeadToHead dropdown sends `frequency_baseline` | Confirmed — dropdown uses `MODEL_NAMES` which now contains `frequency_baseline` |

---

## Issue 2 — Fix Monte Carlo so simulations genuinely vary

Changes made to `server/predictions.ts`:
- Added `simulationIndex: number = 0` parameter to `deterministicSeed()`.
- Incorporated `simulationIndex * 6364136223846793005` into the hash computation.
- Added `simulationIndex: number = 0` parameter to `weightedSampleWithoutReplacement()`.
- Passed `simulationIndex` through to `deterministicSeed()` inside `weightedSampleWithoutReplacement`.
- Exported `weightedSampleWithoutReplacement` for testing (marked with comment).
- In `monteCarloModel`, passed loop variable `s` as `simulationIndex`.

Tests added to `server/predictions.test.ts`:
- `monte_carlo produces stable output for identical inputs` — PASS
- `monte_carlo internal simulations produce varied draws` — PASS

| Check | Result |
|-------|--------|
| `npx vitest run server/predictions.test.ts` | 22 tests passed |
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 3 — Fix DST-aware countdown and next-draw logic

Changes made to `shared/lottery.ts`:
- Added private `toETDate()` helper using `Intl` / `America/New_York` timezone.
- Replaced `etOffset = -5` block in `getNextDrawDate()` with `toETDate(new Date())`.
- Replaced `etOffset = -5` block in `formatTimeUntil()` with `toETDate(new Date())`.
- Removed all `etOffset` variable references from `shared/lottery.ts`.

Changes made to `server/schedule.test.ts`:
- Removed `etOffset` references from existing tests.
- Added 4 new tests as specified in instructions.

Note: `client/src/pages/Home.tsx` still contains `etOffset` — this is a separate client-side usage not in scope for this issue.

| Check | Result |
|-------|--------|
| `npx vitest run server/schedule.test.ts` | 15 tests passed |
| `npx tsc --noEmit` | PASS — zero errors |
| `grep -rn 'etOffset' shared/` | Zero results |
| `grep -rn 'America/New_York' shared/` | 2 results (toETDate helper) |

---

## Issue 4 — Fix null safety in evaluatePurchasedTicketsAgainstDraw

Changes made to `server/db.ts`:
- Added null guard: `if (!db) return;` at the top of the function.
- Replaced all `db!` force-unwraps with `db` (2 occurrences: select and update).
- Added comment above draw-time filtering section documenting the notes-based filtering behavior.

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| No remaining `db!` in function | Confirmed |

---

## Issue 5 — Fix PDF upload repeat-safety

Changes made to `server/upload.ts`:
- PDF upload key: sanitized filename with `replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)`, increased nanoid from 8 to 10 chars, changed separator from `-` to `_`.
- Ticket scan key: same sanitization applied.
- Key generation already used `nanoid()` for uniqueness; the fix adds filename sanitization to handle special characters.
- PDF parser (LLM-based) is invoked per-request — no shared singleton state issue.

Tests added to `server/pdf-parser.test.ts`:
- `generates unique keys for repeated uploads of the same filename` — PASS
- `sanitizes filenames with special characters` — PASS

| Check | Result |
|-------|--------|
| `npx vitest run server/pdf-parser.test.ts` | 4 tests passed |
| `npx tsc --noEmit` | PASS — zero errors |

---

## Issue 6 — Fix the 7 pre-existing failing tests

### Failure 1-5: server/offline-features.test.ts — WhatsNew changelog component (Case A: stale test assertions)

**Root cause:** The WhatsNew component was refactored to import `CHANGELOG` and `ChangelogEntry` from `client/src/lib/version.ts` instead of defining them inline. The tests were asserting raw source text patterns like `const CHANGELOG: ChangelogEntry[]` and `interface ChangelogEntry` that no longer exist in WhatsNew.tsx.

**Fix:** Updated 5 test assertions to match the current component structure:
- `"defines a CHANGELOG array"` → `"imports CHANGELOG from version module"` — asserts `CHANGELOG` is present (imported)
- `"has a ChangelogEntry interface"` → `"uses ChangelogEntry shape via version module"` — asserts `entry.version` and `entry.changes` usage in JSX
- `"supports feature, improvement, and fix change types"` → `"renders feature, improvement, and fix change types"` — unchanged assertion, just renamed
- `"only shows modal when version is newer"` → updated to assert `lastSeen !== APP_VERSION` (was `lastSeen !== currentVersion`)
- `"includes multiple version entries"` → `"includes multiple version entries via imported CHANGELOG"` — asserts `entries.map` iteration

### Failure 6: server/h2h-consensus.test.ts — Version 4.4.0 > service worker matches v4.4.0 (Case A: stale test assertion)

**Root cause:** The service worker was updated to v4.5.1 but the test still hardcoded `'4.4.0'`.

**Fix:** Updated the test to dynamically extract the current version from `version.ts` CHANGELOG and assert the service worker contains it. This makes the test version-agnostic for future releases.

### Failure 7: server/ticket-scanner.test.ts — ticketAnalytics returns expected shape (Case B: source code bug)

**Root cause:** `getTicketAnalytics()` in `server/db.ts` used `db!.select()` without a null guard. In the test environment, `getDb()` returns null, causing a TypeError.

**Fix:** Added `if (!db) return { modelsPlayedMost: [], modelsWonMoney: [], hitRateByModel: [], middayVsEvening: { midday: 0, evening: 0 } };` at the top of the function. Replaced `db!` with `db`.

| Check | Result |
|-------|--------|
| `npx vitest run` | **23 files passed, 359 tests passed, 0 failures** |
| `npx tsc --noEmit` | PASS — zero errors |
| Baseline comparison | 7 failures → 0 failures |

---

## Issue 7 — Add rate limiting to generation endpoints

Files created:
- `server/lib/rateLimiter.ts` — in-memory rate limiter with Map-based tracking, 5-minute cleanup interval.

Changes made to `server/routers.ts`:
- Added imports: `TRPCError` from `@trpc/server`, `checkRateLimit` from `./lib/rateLimiter`.
- Added rate limit check (10 req/min/IP) at the top of `predictions.generate` mutation handler.
- Added rate limit check (10 req/min/IP) at the top of `tickets.generate` mutation handler.
- No other endpoints were modified.

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| TRPCError import resolves | Confirmed |

---

## Issue 8 — Add lightweight cache for model weights

Changes made to `server/db.ts`:
- Added `modelWeightsCache` Map and `MODEL_WEIGHTS_TTL_MS` constant (5 minutes) above `getModelWeights()`.
- Added cache-check at the top of `getModelWeights()`: returns cached weights if within TTL.
- Added cache-write before return: stores computed weights with timestamp.
- No changes to `getModelPerformanceStats()` or the weight calculation formula.

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |

---

## Migration Apply Status

File `drizzle/0008_performance_indexes.sql` exists in repo and is registered
in `_journal.json`. This migration must be applied to the live Render MySQL
instance manually or via deployment pipeline before the indexes take effect.
Until applied, the 5 indexes defined in the file do not exist in production.

---

## Final Verification

### 1. `npx tsc --noEmit`
**PASS** — zero errors

### 2. `npx vitest run`
**23 files passed, 359 tests passed, 0 failures**
Baseline was 7 failures (342 passing / 7 failing across 3 files). All 7 pre-existing failures are now fixed.

### 3. `grep -rn '"random"' shared/ server/ client/src/ --include="*.ts" --include="*.tsx"`
Results — only legacy compatibility alias entries remain, all marked with comments:
- `server/compare-export.test.ts:80` — test fixture data (legacy model name in test)
- `server/compare-export.test.ts:109` — test fixture data
- `server/favorites-push.test.ts:95` — test fixture data
- `server/new-models.test.ts:36` — comment about deterministic "random" numbers
- `server/patterns.test.ts:86` — assertion that model source is NOT "random"
- `client/src/pages/HeadToHead.tsx:11` — comment: "legacy DB rows may exist under 'random'"
- `client/src/pages/Leaderboard.tsx:15` — comment: "legacy DB rows may exist under 'random'"

**All remaining references are either test fixtures or legacy compatibility comments.**

### 4. `grep -rn 'etOffset' shared/ server/ client/src/ --include="*.ts" --include="*.tsx"`
- `shared/` — **zero results** (required)
- `client/src/pages/Home.tsx:55-56` — out-of-scope client-side countdown (not listed in Issue 3 target files). This is a separate DST-vulnerable countdown in the Home page that should be addressed in a future pass.

### 5. `grep -rn 'America/New_York' shared/ --include="*.ts"`
**PASS** — two results in `shared/lottery.ts` (the `toETDate` helper, lines 84 and 86)

### 6. `ls drizzle/0008_performance_indexes.sql`
**PASS** — file exists

---

## Known Remaining Issue (Out of Scope)

`client/src/pages/Home.tsx` contains a separate `etOffset = -5` countdown function (`getCountdown`) that suffers from the same DST bug fixed in Issue 3 for `shared/lottery.ts`. This file was not listed in Issue 3's target files, so it was not modified per the standing rule "Do NOT touch files unrelated to each issue." Recommend addressing in a future pass.
