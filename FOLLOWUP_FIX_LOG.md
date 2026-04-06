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

