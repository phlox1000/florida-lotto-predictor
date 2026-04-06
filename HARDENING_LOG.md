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

