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

## Action 5 — Write mobile MVP baseline document

Created `mobile/MVP_BASELINE.md` with full scope definition for the first Play Store release. The document covers all 4 tabs (Analyze, Generate, Track, Models), global exclusions, acceptance criteria, and the scope change process. The `mobile/` directory was created as it did not previously exist.

---

## Action 6 — Take a database backup

### Step 1 — DATABASE_URL check
`echo $DATABASE_URL` returned empty (confirmed during Action 1). DATABASE_URL is not available in this sandbox environment.

### Result
- **Backup taken:** Deferred — DATABASE_URL is not available in this environment.
- Database backup must be taken manually via Render dashboard before applying the production migration. Navigate to Render > your MySQL service > Backups and create a manual backup.

No commit required for this action.

---

## Final Verification

### 1. `npx tsc --noEmit`
**PASS** — zero errors

### 2. `npx vitest run`
```
Test Files  23 passed (23)
     Tests  359 passed (359)
  Duration  12.71s
```
**0 failures** — matches baseline.

### 3. `grep -rn "etOffset" client/ shared/ server/ --include="*.ts" --include="*.tsx"`
**Zero results** — etOffset is completely eliminated from the codebase.

### 4. Governance files
```
client/MAINTENANCE_MODE.md  — exists
server/BACKEND_STABILITY.md — exists
mobile/MVP_BASELINE.md      — exists
```
All three files confirmed present.

### 5. `git log --oneline -8`
```
efbe90d phase0: action 5 — document mobile MVP baseline
34ba05d phase0: action 4 — document backend stability protocol
3fc54c4 phase0: action 3 — put web app into maintenance mode
9375d30 phase0: action 2 — fix Home.tsx DST countdown
c77917f fix: followup issue 8 — cache model weights with 5-minute TTL
24c248a fix: followup issue 7 — add rate limiting to generation endpoints
5a3ad65 fix: followup issue 6 — restore baseline test suite to green
740b36c fix: followup issue 5 — make pdf upload repeat-safe
```
All phase0 commits visible.

## DB Verification — Manual Steps Check (Phase 0 Completion)

### Step 1 — DATABASE_URL check
`echo $DATABASE_URL` returned empty. DATABASE_URL is still not available in this sandbox environment.

### Migration verification
Verification cannot be completed from this environment — no database connection available.

| Index | Table | Status |
|-------|-------|--------|
| `dr_game_date_idx` | `draw_results` | UNABLE TO VERIFY |
| `mp_model_game_idx` | `model_performance` | UNABLE TO VERIFY |
| `mp_draw_idx` | `model_performance` | UNABLE TO VERIFY |
| `p_game_created_idx` | `predictions` | UNABLE TO VERIFY |
| `p_user_idx` | `predictions` | UNABLE TO VERIFY |

Overall migration status: **UNABLE TO VERIFY** — DATABASE_URL not available in sandbox.

### Backup verification
Backup status: confirmed by developer (cannot be verified programmatically).

### Overall Phase 0 status
Phase 0 verification cannot be completed from this environment. The developer has confirmed both manual steps were performed. To independently verify, connect to the live Render MySQL instance and run:

```sql
SHOW INDEX FROM draw_results WHERE Key_name = 'dr_game_date_idx';
SHOW INDEX FROM model_performance WHERE Key_name IN ('mp_model_game_idx', 'mp_draw_idx');
SHOW INDEX FROM predictions WHERE Key_name IN ('p_game_created_idx', 'p_user_idx');
```

If all 5 indexes are present, Phase 0 is FULLY COMPLETE and ready for Phase 1.
