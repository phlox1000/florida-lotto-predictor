# Web App — Maintenance Mode

**Status:** Maintenance mode as of 2026-04-06

## What this means
- Bug fixes: YES — fix issues that break existing functionality
- New features: NO — defer to mobile app development
- UI refactors: NO — stability over polish during mobile build phase

## Why
The mobile app (mobile/) is now the primary development focus.
The web app remains available as a companion interface but is not
receiving new features during the mobile build phase.

## What counts as a bug fix (allowed)
- Fixing broken functionality
- Fixing incorrect data display
- Fixing crashes or errors
- Security patches

## What is deferred (not allowed during this phase)
- New screens or pages
- New features on existing screens
- Visual redesigns
- Performance improvements that aren't fixing regressions

## Exceptions
Any exception must be documented here before work begins.

## Known Issues
- **GameContextBar "Oracle" text artifact:** Displays "Oracle" text below the nav bar on the Home page. Likely a CSS overflow/z-index issue in the sticky header container. Deferred — web app is in maintenance mode.
