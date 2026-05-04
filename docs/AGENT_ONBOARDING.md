# Agent onboarding

> If you are an AI agent picking up this project, read this first.

This file is short on purpose. Read it before doing anything else, then read [`../README.md`](../README.md) for the full project context. This file assumes you've read the README — do not skip it.

---

## Required reading order

1. [`../README.md`](../README.md) — full project context, architecture, gotchas, incident history. ~600 lines.
2. [`../AGENTS.md`](../AGENTS.md) — top-level repo working priorities (mobile-first, scoped changes, no broad refactors).
3. [`../mobile/AGENTS.md`](../mobile/AGENTS.md) — mobile-specific design direction (Bloomberg-serious, dark-first, no novelty styling) and validation commands.
4. [`../.cursor/rules/`](../.cursor/rules/) — every rule listed below. They are always-applied; you cannot opt out.
5. This file.

---

## Always-on rules in `.cursor/rules/`

| Rule file | What it enforces |
|---|---|
| `git-verification.mdc` | Every task that modifies files must end with `git status`, `git log origin/<branch>..HEAD`, an explicit commit + push, and a final summary line stating the resulting SHA. **Empty `git log` ≠ "implemented".** |

---

## Required reading in `docs/`

### `docs/incidents/`

| File | What it documents |
|---|---|
| `2026-05-02-prediction-learning-metrics-missing.md` | 12-hour production outage. Schema drift between code and Railway MySQL. Compounded by PR #37 having merged with 739 mobile TypeScript errors and by multiple agent sessions reporting "fix implemented" with empty `git log origin/main..HEAD`. **Read this before claiming any task is complete without a commit SHA.** |

### `docs/runbooks/`

| File | What it documents |
|---|---|
| `ota-mobile-update.md` | How OTA updates reach installed APKs via `eas update`. Auto-publish workflow, manual flow, troubleshooting. Required reading before publishing any mobile change to production. |
| `health-checks.md` | `/healthz` and `/health` endpoints, expected log patterns (`[startup] env check`, `[predictions] prediction_learning_metrics missing`, etc.), and when to redeploy vs restart. |

### `docs/DEPLOYMENT.md`

Render env-var reference. Required when changing anything that depends on env vars in production (LLM gateway, OAuth, DB).

---

## Git verification rule (verbatim from `.cursor/rules/git-verification.mdc`)

Every task that modifies files MUST end with these steps in order:

1. Run `git status` and report the full output verbatim.
2. Run `git log origin/<current-branch>..HEAD --oneline` (or `git log origin/main..HEAD --oneline` if on `main`) and report the full output verbatim.
3. If there are uncommitted changes that are part of the task: stage them, commit with a clear message, and report the resulting SHA.
4. If there are committed changes that haven't been pushed: push them and report the push output verbatim.
5. State explicitly in your final summary: "Final commit SHA on remote: \<SHA\>" or "No commits made — nothing to push."

Never claim a task is "implemented", "fixed", "deployed", or "ready" if `git log origin/<branch>..HEAD` is empty. Empty `git log` means nothing happened from the perspective of anyone reviewing the work.

Do not amend, rebase, force-push, or rewrite history unless explicitly authorized.

When ending a session that involved a feature branch, suggest the next action (open a PR, or merge if authorized).

This rule exists because of an incident on 2026-05-02 where multiple agent sessions reported "fix implemented" without committing, leading to a 12-hour production outage. See `docs/incidents/2026-05-02-prediction-learning-metrics-missing.md`.

---

## Do not lose data

These actions are forbidden without explicit, scoped authorization from the maintainer in the same session:

- **Do not delete files that contain user data or production state.** This includes `mobile/.env`, `render.yaml`, anything in `drizzle/`, anything that looks like a config snapshot, and any `*.json` that might be a checked-in fixture.
- **Do not drop database tables.** Ever. Not as part of a "clean state" migration, not as part of a "let me just rebuild the schema" suggestion, not even in a Drizzle migration. The 2026-05-02 incident demonstrated that schema drift is the single most expensive failure mode in this codebase.
- **Do not force-push.** Not to `main`, not to shared branches, not to PR branches the maintainer has reviewed. If you've made a mistake, create a new commit that undoes it.
- **Do not run untested migrations against production.** Migrations are applied manually out-of-band via DBeaver / Railway console, in a transaction, with `SHOW CREATE TABLE` verification. There is no auto-migrate on server boot, and there should not be.
- **Do not change the `florida-lotto-predictor.saved-picks.v1` AsyncStorage format.** Backward compatibility for v1 is mandatory because installed APKs in the wild cannot be migrated until they update — and some installed APKs cannot receive OTA at all.
- **Do not remove the `prediction_learning_metrics` fallback in `server/db.ts`.** It is a permanent safety net for schema-vs-code drift, not a temporary workaround.

If you think a forbidden action is the right move, **stop and ask** instead of doing it.

---

## Small commits, clear messages

- **One logical change per commit.** A single commit that touches both the storage layer and the UI layer is hard to review and impossible to bisect. Split it.
- **Commit messages explain why, not just what.** "Add try/catch" is what; "wrap getPredictionLearningMetrics in try/catch so a missing table doesn't 500 the whole predictions.generate flow" is why. Reviewers and your future self both need the why.
- **Use the body of the commit message.** Subject line ≤72 chars, blank line, then full prose explaining context and decisions. Look at recent commit history for examples.
- **Reference the PR or issue in the body.** Not in the subject. Subject stays clean for git log readability.
- **Co-author tags are fine** but they are not a substitute for a clear human-readable message.

---

## Ask clarifying questions

When the spec is ambiguous, **ask before writing code.** The maintainer would rather answer one structured question than review code that solved the wrong problem.

Specifically, ask when:

- The spec contains a factual claim that contradicts the current state of the repo (e.g. "this repo is mobile-only" when it's actually a monorepo).
- A constraint and a goal appear to conflict (e.g. "do not modify file X" but file X is the only place the requested change can live).
- Multiple reasonable interpretations exist and they would produce materially different PRs (e.g. "add a backup feature" — to a file? to a server? merge or replace existing data?).
- The spec asks for a dependency or API that you can't confirm exists at the current SDK version (check `package.json` and the relevant `node_modules/<pkg>/build/*.d.ts` first, then ask).

Use the question tool with concrete options when available — multiple-choice questions get answered faster and reduce ambiguity. Free-text questions are appropriate when the answer space is genuinely open.

The 30-second clarifying exchange is always cheaper than a 600-line PR that has to be redone.

---

## Report all task items, not just the first

When a prompt has multiple numbered tasks or sub-goals:

- **Complete all of them, or explicitly state which were skipped and why.** Silently dropping later items is the failure mode most likely to ship a half-done PR.
- **Surface drop decisions in the PR description.** Not just in your chat reply — the PR description is what the maintainer (and future agents) will read months later.
- **Surface drop decisions in the corresponding commit message.** Same reason.
- **If a sub-goal becomes infeasible mid-task, stop and report.** Don't proceed assuming the maintainer will notice the gap from your final summary alone.
- **Lesson from PR #55:** an "auto-detect on first launch" sub-goal was authorized to be dropped if the API surface didn't support it cleanly, and that drop was correctly surfaced in commit message and PR body. That is the bar — visibility, not just completion.

If you have a TodoWrite-style task list available in your runtime, use it. It makes silent drops impossible by construction because every item has explicit `completed` / `cancelled` status.

---

## Final-summary checklist

At the end of every task, your final message to the maintainer should include:

- [ ] Files changed (with line counts).
- [ ] Commit SHAs (every commit, not just the latest).
- [ ] Branch name and PR URL (if applicable).
- [ ] Validation results (`pnpm check`, `pnpm test`, `pnpm exec tsc --noEmit --types node` from `mobile/` — whichever applies).
- [ ] Confirmation that no out-of-scope files were touched (call out specific files when the spec named them).
- [ ] Any TODO markers or skipped sub-goals, surfaced explicitly.
- [ ] "Final commit SHA on remote: \<SHA\>" line, exactly as the git-verification rule requires.

That last line is non-negotiable. If you can't produce it truthfully, the task is not done.
