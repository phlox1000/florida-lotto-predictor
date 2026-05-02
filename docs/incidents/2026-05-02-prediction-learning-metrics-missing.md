# Incident: prediction_learning_metrics table missing in production

**Date:** 2026-05-02
**Duration:** ~12 hours from first report to mitigation
**Severity:** Production outage of `predictions.generate` (Generate Analysis feature)
**Root cause:** Schema drift — application code queried a table that was never migrated to production. Compounded by PR #37 merging in a non-compiling state with 739 TypeScript errors in the mobile workspace.

## Timeline

- ~04:19 UTC — First failure observed in Render logs: `Table 'railway.prediction_learning_metrics' doesn't exist`
- ~07:09 UTC — Diagnosis: missing table for `factor` and `model` metric type queries running in parallel via `Promise.all` in `generatePredictions`
- ~10:41 UTC — Server fallback merged in PR #52 commit `d764253`
- ~15:25 UTC — Render redeploy completes, fallback active in production
- ~15:35 UTC — Generate Analysis confirmed working from installed APK

## Root cause analysis

### Primary cause

The Drizzle migration `drizzle/0012_prediction_learning_metrics.sql` exists in the repo but was never applied to the Railway MySQL production database. The application code at `server/services/predictions.service.ts` and `server/services/learningValidation.service.ts` reads from this table on every `predictions.generate` call. With the table missing, every read threw `ER_NO_SUCH_TABLE` (errno 1146).

### Compounding causes

1. **PR #37 was merged with 739 TypeScript errors.** No CI gate enforced `tsc --noEmit` before merge. `AnalyzeScreen.tsx` alone had 202 errors including duplicate `const generate` declarations and missing UI primitive imports. This blocked the original PR #52 merge for hours and forced a revert (PR #53, commit `6433cee`).
2. **Multiple Cursor sessions reported "fix implemented" without committing or pushing.** The server fix sat in the working tree across at least three sessions before any commit was made. Each session's "summary" implied the fix was deployed, but `git log origin/main..HEAD` was empty.
3. **Production error UI swallowed the underlying tRPC error code.** The user-facing message "Generation failed — check your connection" obscured the actual `INTERNAL_SERVER_ERROR` for hours.

## Mitigation

PR #52 (`d764253`) added:

- A try/catch wrapper around `getPredictionLearningMetrics` SELECT in `server/db.ts` that catches `ER_NO_SUCH_TABLE` (errno 1146), walks the `.cause` chain up to 8 levels deep through Drizzle/mysql2 wrappers, returns `[]`, and logs a single warning per process lifetime.
- A defensive substring check on `sqlMessage` to prevent masking missing-table errors from other tables.
- The same fallback applied to the write path in `rebuildPredictionLearningMetricsFromEvents`.

PR #52 also added (for future debuggability):

- `mobile/src/lib/buildIdentity.ts` — runtime version, update ID, commit SHA helpers.
- `mobile/src/lib/updates.ts` — `fetchPendingUpdate` and `applyPendingUpdate`, gated on `!__DEV__ && Updates.isEnabled`, all errors swallowed.
- `mobile/src/components/UpdatePrompt.tsx` — user-prompt modal with session-only dismiss via `useRef`.
- A production-safe `code: <TRPC_CODE>` line beneath the existing `Generation failed` `StateBlock` on the Analyze screen.
- Build identity strip at the top of the Analyze screen showing `rv <runtimeVersion> · id <updateId|embedded> · sha <8 chars>`.

PR #53 (`6433cee`) reverted PR #37 (`5aab6ad`) to restore `main` to a compiling state, which was a precondition for merging PR #52 cleanly.

## Outstanding work

- **Run the actual migration in Railway.** The fallback is permanent-safe but personalization metrics will not populate until the table exists. Plan: validate `drizzle/0012_prediction_learning_metrics.sql` matches the live `predictions` table conventions (utf8mb4, utf8mb4_0900_ai_ci, InnoDB), open a transaction in DBeaver, run the CREATE TABLE, verify with `SHOW CREATE TABLE`, commit. Do this in a calm scheduled session, not as fire-fighting work.
- **Re-author the Home dashboard.** The original work lives on `cursor/home-dashboard-mobile-1904`. Before re-merging, all 739 mobile tsc errors must be fixed and `pnpm check` plus `pnpm exec tsc --noEmit --types node` from `mobile/` must pass. The CI gate added in this hardening PR will enforce that.
- **OTA-ship the new mobile diagnostics to the installed APK.** From a machine with EAS auth: `cd mobile && eas update --branch <channel-of-installed-apk> --message "diagnostic strip + update prompt"`. Channel comes from `eas channel:list`. See `docs/runbooks/ota-mobile-update.md`.

## Lessons applied (this PR)

- CI gate on `main` requiring `tsc --noEmit` (root) and `tsc --noEmit --types node` (mobile) to pass.
- Required-status branch protection rule documented as a manual GitHub UI step.
- Cursor agent rule added to enforce git verification at end of every task.
- Documented runbook for OTA updates so future deploys to the installed APK don't require relearning the workflow.
- Documented health-check and observability endpoints so on-call response is faster next time.

## Diagnostic surfaces now available

- `https://florida-lotto-predictor.onrender.com/healthz` — liveness probe, returns `{ok, uptime}`.
- `https://florida-lotto-predictor.onrender.com/health` — env-var presence log + uptime.
- Render logs — `[predictions] prediction_learning_metrics missing` warning fires once per process lifetime; if it fires every request, the one-shot flag is broken.
- Render logs — `[startup] env check {...}` block on every restart; missing critical env vars surface here.
- Mobile Analyze screen — top-of-screen build-identity strip shows which bundle is running.
- Mobile Analyze screen — `code: <TRPC_CODE>` line beneath any error tells the actual server error category in production.

## Related references

- Server fix PR: [#52 `d764253`](https://github.com/phlox1000/florida-lotto-predictor/pull/52)
- PR #37 revert: [#53 `6433cee`](https://github.com/phlox1000/florida-lotto-predictor/pull/53)
- PR #37 (broken Home dashboard, source preserved on `cursor/home-dashboard-mobile-1904`): [#37 `5aab6ad`](https://github.com/phlox1000/florida-lotto-predictor/pull/37)
- Health check runbook: `docs/runbooks/health-checks.md`
- OTA update runbook: `docs/runbooks/ota-mobile-update.md`
