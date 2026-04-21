# Mobile UI Audit

Last inspected: 2026-04-21

## Current Screen Surface

- `App.tsx`: Navigation container, bottom tab navigator, tab icons, tab tint colors, and status bar.
- `src/screens/AnalyzeScreen.tsx`: Main functional screen. Includes active game selector, next draw card, generate action, loading/error states, and top prediction rows.
- `src/screens/GenerateScreen.tsx`: Placeholder-like centered title.
- `src/screens/TrackScreen.tsx`: Placeholder-like centered title.
- `src/screens/ModelsScreen.tsx`: Placeholder-like centered title plus mobile build label.

## Current Shared Structure

- `src/lib/env.ts`: API URL normalization and mobile request timeout.
- `src/lib/trpc.ts`: tRPC client and fetch timeout wrapper.
- `src/lib/QueryProvider.tsx`: React Query/tRPC provider and conservative default options.
- `src/lib/version.ts`: Mobile build label derived from version metadata.
- No shared UI component directory exists yet.
- No theme, token, color, spacing, or typography helper exists yet.

## Navigation And Tab Styling

- Bottom tab setup lives in `App.tsx`.
- Icons come from `@expo/vector-icons/Ionicons`.
- Active and inactive tint colors are defined inline in the tab navigator screen options.
- Future tab redesign should preserve route names and screen behavior while moving visual constants into a small UI foundation.

## Reusable Foundation Opportunities

- `ScreenShell`: Shared safe layout, dark background, horizontal padding, and scroll behavior.
- `SectionCard`: Compact analytical card for summaries, predictions, schedules, and model stats.
- `MetricRow`: Label/value row for next draw, ROI, model rank, confidence, and status summaries.
- `NumberChip`: Reusable lottery number display with serious, data-oriented styling.
- `GameSelector`: Horizontal active-game selector shared by Analyze and Generate.
- `PrimaryActionButton`: Consistent action styling for Generate, Analyze, Save, and Log Ticket flows.
- `StateBlock`: Shared loading, empty, timeout, and error state component.
- `BuildLabel`: Subtle version/build label that can stay on Models or move to a settings/about surface later.

## Suggested First Entry Point For The Next UI Pass

1. Add a small UI foundation under `src/ui` or `src/components` with theme tokens and 3 to 5 primitives.
2. Update `App.tsx` bottom tab styling to match the dark analytical direction.
3. Restyle `AnalyzeScreen.tsx` using the new primitives while preserving its working API behavior.
4. Replace placeholder-like Generate, Track, and Models screens with polished empty or partial states backed by existing documented API scope.

## Guardrails For The Next UI Pass

- Keep real data real and missing data explicit.
- Do not fabricate model scores, winnings, tickets, or historical performance.
- Avoid broad navigation changes during the first visual overhaul.
- Preserve the working Android dev build and rerun Expo config, TypeScript, and Expo Doctor checks after changes.
