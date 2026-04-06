# Backend Stability Protocol

**Status:** Active — mobile development phase

## Rule
Backend changes are batched and deliberate, not ad hoc.

## What is allowed
- Bug fixes to existing endpoints
- Security patches
- Performance improvements that don't change response shapes
- New endpoints added for mobile (additive only, not breaking)

## What requires explicit coordination
- Any change to an existing tRPC procedure's input or output shape
- Any change to shared/ types
- Any schema change
- Any new dependency added to server/

## Why this matters
Both the web app (client/) and the mobile app (mobile/) consume this
backend. An uncoordinated change to a shared endpoint or type can
silently break one or both clients.

## Process for coordinated changes
1. Document the proposed change before making it
2. Check impact on: web client, mobile client, shared types
3. Update both clients if needed before or immediately after
4. Run full test suite after any coordinated change

## Changes that do NOT require coordination
- Internal refactors with no API surface change
- Log improvements
- Cron job timing adjustments
- Error message improvements (non-breaking)
