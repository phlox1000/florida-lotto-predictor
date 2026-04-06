# Phase 0 — Mobile App Foundation Log

## Baseline

### `npx tsc --noEmit`
PASS — zero errors

### `npx vitest run`
```
Test Files  23 passed (23)
     Tests  359 passed (359)
  Start at  12:04:06
  Duration  12.41s
```
0 failures.

### `git log --oneline -5`
```
c77917f fix: followup issue 8 — cache model weights with 5-minute TTL
24c248a fix: followup issue 7 — add rate limiting to generation endpoints
5a3ad65 fix: followup issue 6 — restore baseline test suite to green
740b36c fix: followup issue 5 — make pdf upload repeat-safe
7f70db5 fix: followup issue 4 — null safety in evaluatePurchasedTicketsAgainstDraw
```

---

## Action 1 — Apply DB migration to production

### Step 1 — Migration file verification
`drizzle/0008_performance_indexes.sql` confirmed to contain exactly 5 CREATE INDEX statements:
1. `dr_game_date_idx` on `draw_results (gameType, drawDate)`
2. `mp_model_game_idx` on `model_performance (modelName, gameType)`
3. `mp_draw_idx` on `model_performance (drawResultId)`
4. `p_game_created_idx` on `predictions (gameType, createdAt)`
5. `p_user_idx` on `predictions (userId, createdAt)`

### Step 2 — DATABASE_URL check
`echo $DATABASE_URL` returned empty. DATABASE_URL is not available in this sandbox environment.

### Result
- **Migration applied:** Deferred — DATABASE_URL is not available in this environment.
- Migration must be applied manually via Render dashboard or deployment pipeline. SQL is in `drizzle/0008_performance_indexes.sql`.
- No errors encountered — the migration file is valid and registered in `_journal.json`.

No repo file changes required. No commit for this action.

---

## Action 2 — Fix Home.tsx DST countdown

### Analysis
`getCountdown()` in `client/src/pages/Home.tsx` was computing the exact same thing as `formatTimeUntil()` in `shared/lottery.ts`: a countdown string with days/hours/minutes, returning "Drawing now!" for past dates. The only difference was the DST-broken `etOffset = -5` approach.

### What changed
- **Removed** the inline `getCountdown` function body (12 lines including `etOffset = -5`)
- **Replaced** with a one-liner delegating to `formatTimeUntil(new Date(nextDrawIso))` from `shared/lottery.ts`
- **Added** `formatTimeUntil` to the existing import from `@shared/lottery`
- No other logic in Home.tsx was changed

### Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| `npx vitest run` | 22 files passed, 335 passed (scraper test excluded for speed — network-dependent) |
| `grep -rn "etOffset" client/ shared/ server/` | **Zero results** |

---

## Action 3 — Put web app into maintenance mode

- Created `client/MAINTENANCE_MODE.md` with full governance document.
- No README.md exists in the repo root — skipped the one-line note per instructions ("skip if no README exists").
- Maintenance mode is established as of 2026-04-06.

---

## Action 4 — Document backend stability protocol

Created `server/BACKEND_STABILITY.md` with the full governance document covering allowed changes, coordination requirements, and the process for coordinated changes during the mobile development phase.

---

