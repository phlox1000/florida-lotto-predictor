# Mobile MVP Baseline

**Purpose:** Define what is in and out of scope for the first Play Store
release. This document is the scope authority during mobile development.
Changes require explicit revision, not casual addition.

---

## Tab 1 — Analyze

### In scope
- Game selector (all active Florida Lottery games)
- Next draw countdown (DST-correct, America/New_York)
- Last draw result display
- Top prediction picks from predictions.generate
- Light hot/cold number indicators from patterns.analyze

### Out of scope for MVP
- Full heatmap view
- AI Analysis tab (LLM-powered)
- Pattern deep-dive views
- PDF upload / ticket scanner

---

## Tab 2 — Generate

### In scope
- Quick Pick generation
- Smart generation (model-weighted predictions)
- Budget ticket selection (up to $75 / 20 tickets)
- Results display with model source labels

### Out of scope for MVP
- Number wheel generator
- Favorites management
- Export to PDF

---

## Tab 3 — Track

### In scope
- Purchased ticket list
- Log a new ticket purchase
- Update ticket outcome (win/loss)
- ROI summary stats

### Out of scope for MVP
- Bulk ticket logging
- Ticket scanner (camera-based OCR)

### Auth dependency
Track requires authenticated session.
Auth must be solved before Track is built.

---

## Tab 4 — Models

### In scope
- Leaderboard (by game)
- Model performance summary

### Out of scope for MVP
- Head-to-head comparison
- Model trend charts
- Compare view

---

## Global out of scope for MVP
- Push notifications
- Offline mode
- Admin panel
- Dark/light theme toggle
- PWA features

---

## Acceptance criteria for MVP completion

Each tab is considered complete when:
1. It runs on a physical Android device
2. It displays real data from the live backend
3. It handles loading, empty, and error states gracefully
4. It does not crash under normal use

---

## Scope change process

Any addition to this scope must be:
1. Written here before work begins
2. Assessed for backend impact
3. Assessed for timeline impact
