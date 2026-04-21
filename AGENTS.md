# Codex Guidance

This repository is the source of truth for the Florida Lotto Predictor app. Do not use, compare against, or copy from other local repo copies.

## Working Priorities

- Prioritize stable mobile prototype work unless the user explicitly asks for another area.
- Keep changes scoped, minimal, and easy to review.
- Preserve the current production/backend behavior unless backend work is explicitly requested.
- Avoid backend, cron, database, Render, or auth changes during mobile UI tasks unless the user names that scope directly.
- Do not introduce broad refactors, dependency churn, or architecture changes without a clear task-level reason.

## Product Direction

- Preserve a serious analytical product direction.
- The mobile app should feel like a premium forecasting or investment-style tool, not a novelty lottery app.
- Avoid casino styling, gimmicky language, jackpot hype, neon-heavy presentation, or "AI magic" wording.
- Favor calm, trustworthy, data-forward UI patterns with honest loading, empty, and error states.

## Validation

- Run checks that match the files changed.
- For general repo work, consider `pnpm check` and `pnpm test`.
- For mobile work, follow the scoped guidance in `mobile/AGENTS.md`.
- If a known out-of-scope validation issue appears, report it clearly instead of broadening the change.

## Documentation Discipline

- Update small guidance or audit docs when they materially help future work.
- Do not let documentation edits become a substitute for working code when the user asks for implementation.
