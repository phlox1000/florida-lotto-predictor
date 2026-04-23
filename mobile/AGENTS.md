# Mobile Codex Guidance

This directory contains the Expo mobile app. In this monorepo, Expo and EAS commands should be run from this `mobile` directory unless the user explicitly asks otherwise.

## Design Direction

- Build toward a premium, analytical, calm, and trustworthy mobile experience.
- Aim for Bloomberg or investment-app seriousness, adapted for a focused Florida lottery forecasting prototype.
- Future UI work should prefer a dark-first design direction with restrained contrast, dense-but-readable data, and polished states.
- Do not use casino, slot-machine, neon, jackpot, or novelty styling.
- Do not add hype language, fake intelligence claims, or dishonest metrics.
- If a screen is incomplete, use a polished empty state or "not yet available" state rather than fake data.

## Implementation Style

- Preserve functional behavior while redesigning.
- Prefer a small reusable UI foundation over one-off screen styling.
- Good future primitives include screen shells, cards, metric rows, number chips, segmented controls, buttons, status badges, loading states, error states, and empty states.
- Keep the current Expo identity, Android package, and versioning behavior stable unless the user explicitly asks to change them.
- Keep `mobile/version.json` as the mobile version source of truth.
- Avoid dependency changes unless they directly unblock mobile build or runtime stability.

## Mobile Validation

Use the smallest relevant set for the change:

```powershell
pnpm exec expo config --json
pnpm --filter mobile exec tsc --noEmit --types node
npx expo-doctor@latest
npx expo start
```

Use `npx expo start` only when interactive/manual device testing is relevant.
