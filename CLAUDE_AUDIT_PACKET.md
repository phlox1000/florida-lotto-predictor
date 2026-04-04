# CLAUDE Audit Packet (No-GitHub Review)

## 1) Executive summary

### What the app is
- A Florida lottery analytics web app with:
  - multi-model prediction generation (18 models),
  - ranked candidate selection + personalization blend,
  - "Play Tonight" recommendation orchestration,
  - ticket generation/tracking,
  - PDF/image ingestion for draw/ticket extraction.

### What is proven working at runtime
- **VERIFIED**: Live DB connectivity and read/write behavior were exercised against the running environment, with table-level and row-level evidence artifacts.
- **VERIFIED**: Key write paths persisted retrievable data (predictions, candidate batches/features, ticket selections, purchases, draw inserts, PDF upload metadata).
- **VERIFIED**: Protected/admin route pass succeeded via invoked matrix and DB deltas (status 200 + persisted-table evidence).

### What remains uncertain
- **ASSUMED**: External service quality/reliability (OpenAI OCR/LLM analysis) beyond the exercised calls.
- **ASSUMED**: Long-horizon model quality and stability under production traffic/data volume.
- **ASSUMED**: Full behavior under real auth provider flows (verification used auth-disabled admin-mode runtime for broad endpoint exercise).

### Top 3 risks
1. **MISSING schema/runtime parity**: `personalization_metrics` is defined/referenced in code + migration, but absent in live DB.
2. **External dependency fragility**: OCR/analysis paths can degrade when API keys/network/model responses are unavailable.
3. **Prediction determinism is bounded**: core selection is formulaic/heuristic, but some model tie-breaking uses minute-level time seed, so outputs vary over time windows.

---

## 2) Repo structure (important only)

```text
client/
  src/pages/Predictions.tsx
  src/pages/Tracker.tsx
  src/pages/Admin.tsx
  src/lib/trpc.ts

server/
  routers.ts
  db.ts
  predictions.ts
  play-tonight.ts
  ranker-v2.ts
  ranker-v2-db.ts
  personalization-metrics.ts
  upload.ts
  _core/context.ts
  _core/trpc.ts
  _core/llm.ts
  _core/openai-ocr.ts

shared/
  lottery.ts
  types.ts

drizzle/
  schema.ts
  0007_personalization_metrics.sql
```

---

## 3) Core prediction engine map

## Prediction generation
- `server/predictions.ts`
  - `runAllModels(cfg, history, modelWeights?)`
  - Runs 18 model outputs (including `ai_oracle` ensemble) and returns prediction set.

## Play Tonight recommendation
- `server/play-tonight.ts`
  - `buildPlayTonightRecommendation(...)`
  - Chooses game + scores candidate picks via weighted blend of confidence, model usefulness, consensus, pattern fit, and personal ROI signal.

## Weighting / ranking
- `server/ranker-v2.ts`
  - `computeCandidateFeatures(...)`
  - `rankCandidates(...)`
  - `applyPersonalizedReranking(...)`
  - `diversifyRankedCandidates(...)`
- `server/routers.ts`
  - `buildRankedPredictionBundle(...)` orchestrates end-to-end rank pipeline.

## Historical stats
- `server/db.ts`
  - `getModelPerformanceStats(gameType)`
  - `getModelWeights(gameType)`
  - `getDrawResults(gameType, limit)`
  - `getROIByGame(userId)`

## Persistence of predictions
- `server/db.ts`
  - `insertPredictions(...)`
- `server/ranker-v2-db.ts`
  - `createPredictionCandidateBatch(...)`
  - `storePredictionCandidatesAndFeatures(...)`
- `server/routers.ts`
  - `predictions.generate` + `tickets.generate` call `buildRankedPredictionBundle(...)`, then persist predictions/candidates/features.

## Ticket generation
- `server/predictions.ts`
  - `selectBudgetTickets(...)`
- `server/routers.ts`
  - `tickets.generate` endpoint
- `server/db.ts`
  - `insertTicketSelection(...)`

## OCR/PDF ingestion
- `server/upload.ts`
  - `registerUploadRoutes(app)`
  - `POST /api/upload-pdf`
  - `processPdfWithLLM(...)`
  - `POST /api/upload-ticket`
  - `processTicketImageWithLLM(...)`
  - `POST /api/manual-ticket`
- `server/db.ts`
  - `insertPdfUpload(...)`
  - `updatePdfUploadStatus(...)`
  - scanned/purchased ticket insert/update helpers.

---

## 4) Live runtime verification summary

### DB connectivity + persistence
- **VERIFIED** via direct live DB introspection and readback probes:
  - Live table list + columns + sample rows were extracted.
  - Multi-table write/readback probe confirmed inserts/updates/deletes are retrievable.
  - Aggregate signal counts confirm non-empty operational data in draw, prediction, ticket, and ranker-related tables.

### Strict verification pass
- **VERIFIED**:
  1. Live table/column reality (not just schema definitions).
  2. Real sample row extraction.
  3. Write-path persistence/readback checks.
  4. Endpoint classification for persistent vs non-persistent behavior.
  5. Logic-vs-storage gap callout (`personalization_metrics`).

### Second-pass endpoint invocation verification
- **VERIFIED** via invocation matrix:
  - Key routes invoked now with `ok=true`, `status=200`.
  - DB deltas confirm persistence where expected:
    - `predictions` +36, `prediction_candidate_batches` +2,
    - `ticket_selections` +1,
    - `purchased_tickets` +3 net,
    - `draw_results` +11,
    - `pdf_uploads` +1.
  - Non-persistent endpoints explicitly return response-only behavior.

---

## 5) Live DB reality

### Confirmed live tables
- `__drizzle_migrations`
- `draw_results`
- `favorites`
- `model_performance`
- `pdf_uploads`
- `personal_ranker_promotion_audit`
- `personal_ranker_versions`
- `prediction_candidate_batches`
- `prediction_candidates`
- `prediction_feature_snapshots`
- `prediction_outcomes`
- `predictions`
- `purchased_tickets`
- `push_subscriptions`
- `ranker_versions`
- `scanned_ticket_feature_snapshots`
- `scanned_ticket_outcomes`
- `scanned_ticket_rows`
- `scanned_tickets`
- `ticket_selections`
- `users`

### Missing expected table(s)
- **MISSING**: `personalization_metrics`
  - Referenced by runtime code (`server/personalization-metrics.ts`) and schema/migration (`drizzle/schema.ts`, `drizzle/0007_personalization_metrics.sql`), but absent in live DB table list.

---

## 6) Endpoint status matrix

| endpoint | proven invoked now | persisted table(s) | notes |
|---|---|---|---|
| `predictions.generate` | yes | `predictions`, `prediction_candidate_batches`, `prediction_candidates`, `prediction_feature_snapshots` | **VERIFIED** persistence with ID/count deltas |
| `tickets.generate` | yes | `ticket_selections` | **VERIFIED** persisted selection row |
| `favorites.add` | yes | `favorites` | **VERIFIED** insert |
| `favorites.use` | yes | `favorites` | **VERIFIED** usage increment path |
| `push.subscribe` | yes | `push_subscriptions` | **VERIFIED** upsert/update behavior |
| `push.updatePreferences` | yes | `push_subscriptions` | **VERIFIED** preference update |
| `tracker.logPurchase` | yes | `purchased_tickets` | **VERIFIED** insert |
| `tracker.logBulkPurchase` | yes | `purchased_tickets` | **VERIFIED** insert batch |
| `tracker.updateOutcome` | yes | `purchased_tickets` | **VERIFIED** outcome fields update |
| `tracker.delete` | yes | `purchased_tickets` | **VERIFIED** row removed (`rowExistsAfterDelete=false`) |
| `draws.add` | yes | `draw_results` | **VERIFIED** draw insert |
| `dataFetch.fetchHistory` | yes | `draw_results` | **VERIFIED** inserted rows |
| `dataFetch.fetchLatest` | yes | `draw_results` | **VERIFIED** invocation; insertedCount can be 0 when no new data |
| `POST /api/manual-ticket` | yes | `purchased_tickets` | **VERIFIED** manual ingestion persisted |
| `POST /api/upload-pdf` | yes | `pdf_uploads` | **VERIFIED** upload row persisted (`status=processing` at capture) |
| `analysis.generate` | yes | none | **VERIFIED non-persistent** response path |
| `export.ticketsPdf` | yes | none | **VERIFIED non-persistent** export payload path |
| `predictions.quickPick` | yes | none | **VERIFIED non-persistent** random generator |
| `wheel.generate` | yes | none | **VERIFIED non-persistent** combinatorics generator |

---

## 7) Stubs / non-persistent / caveats

- `export.ticketsPdf`
  - **VERIFIED** generator-only endpoint (builds export data; no DB write evidence expected).
- `predictions.quickPick`
  - **VERIFIED** non-persistent utility path using `Math.random()` for comparison picks.
- `wheel.generate`
  - **VERIFIED** non-persistent combinational calculator.
- `analysis.generate`
  - **VERIFIED** non-persistent; depends on external LLM invocation and returns fallback text on failure.
- OCR/PDF flows (`/api/upload-pdf`, `/api/upload-ticket`)
  - **VERIFIED** DB write envelope and background processing kickoff.
  - **ASSUMED** extraction quality/completeness across all real-world file variations (external/model-dependent).
- Personalization metrics
  - **MISSING** live storage table despite code and migration references.

---

## 8) Recommendation engine reality check

- **Deterministic**: **Partially VERIFIED**
  - Core scoring formulas are deterministic for same inputs.
  - Some model selection/tie-break paths include minute-level time seed (`Date.now()`-derived), so output is stable only within that time granularity.
- **Heuristic**: **VERIFIED**
  - Multiple heuristic components (sum-range behavior, odd/even and high/low pattern fit, consensus overlap).
- **Weighted**: **VERIFIED**
  - Uses model weights from historical performance and weighted candidate scoring in both rank pipeline and Play Tonight scoring.
- **Adaptive**: **Partially VERIFIED**
  - Global ranker training/evolution + personal reranking logic exists and persists supporting entities.
  - Personalization impact metric persistence is impaired by missing `personalization_metrics` table in live DB.

Conservative conclusion: the system is a weighted heuristic recommendation framework with partial adaptivity; it is not a stable deterministic solver across time windows and not a guarantee model.

---

## 9) Recommended next priorities (top 5)

1. **Fix schema/runtime parity immediately**: apply/repair migration so `personalization_metrics` exists in live DB.
2. **Harden end-to-end OCR observability**: track parse success/failure classes and extraction confidence for `/api/upload-pdf` and `/api/upload-ticket`.
3. **Stabilize reproducibility mode**: add optional fixed-seed or request-seed path for repeatable audits/debugging of model outputs.
4. **Add contract tests for persistent endpoints**: assert response + DB delta for key write routes (`predictions.generate`, `tickets.generate`, tracker and upload flows).
5. **Clarify scoring telemetry in API response**: expose normalized weights/components used by Play Tonight and ranker selection to improve explainability and trust.

---

## 10) Key file excerpts (short)

### A) Main prediction orchestration (`server/routers.ts`)

```ts
async function buildRankedPredictionBundle(params: { ... }) {
  const historyRows = await getDrawResults(params.gameType, 200);
  const modelWeights = await getModelWeights(params.gameType);
  const rankerState = await getOrCreateActiveRankerVersion(params.gameType);

  let predictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);
  if (params.sumRangeFilterApplied) predictions = applySumRangeFilter(predictions, cfg, history);

  const featureRecords = computeCandidateFeatures(cfg, history, predictions, modelWeights, modelAvgHits);
  const ranked = rankCandidates(featureRecords, rankerState);
  ...
  await insertPredictions(...);
  const candidateBatchId = await createPredictionCandidateBatch(...);
  await storePredictionCandidatesAndFeatures(...);
  enqueuePersonalizationRequestMetric(...);
}
```

### B) Play Tonight (`server/play-tonight.ts`)

```ts
export async function buildPlayTonightRecommendation(params: { ... }) {
  ...
  const validPredictions = predictions.filter(p => p.mainNumbers.length > 0 && !p.metadata?.insufficient_data);
  ...
  const finalScore = clamp(
    0.35 * clamp(prediction.confidenceScore) +
    0.3 * modelUsefulness +
    0.2 * consensusSupport +
    0.1 * pattern.score +
    0.05 * personalScore
  );
  ...
}
```

### C) DB wiring / persistence (`server/db.ts`, `server/ranker-v2-db.ts`)

```ts
export async function insertPredictions(data: InsertPrediction[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(predictions).values(data);
}
```

```ts
export async function createPredictionCandidateBatch(data: InsertPredictionCandidateBatch): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(predictionCandidateBatches).values(data);
  return extractInsertId(result);
}
```

### D) Personalization metrics gap (`server/personalization-metrics.ts`, `drizzle/0007_personalization_metrics.sql`)

```ts
await db.insert(personalizationMetrics).values(row).onDuplicateKeyUpdate({ set: { ... } });
```

```sql
CREATE TABLE `personalization_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  ...
  CONSTRAINT `personalization_metrics_id` PRIMARY KEY(`id`)
);
```

Runtime reality: table definition exists in migration/code, but live DB table list does not include `personalization_metrics`.

---

## 11) Artifact index

- `/opt/cursor/artifacts/live_db_table_list.json`
- `/opt/cursor/artifacts/live_db_columns_summary.json`
- `/opt/cursor/artifacts/live_db_audit.json`
- `/opt/cursor/artifacts/live_write_readback_probe.json`
- `/opt/cursor/artifacts/live_db_endpoint_signal_counts.json`
- `/opt/cursor/artifacts/endpoint_invocation_matrix_run2.json`
- `/opt/cursor/artifacts/endpoint_invocation_matrix_table.md`
- `/opt/cursor/artifacts/endpoint_invocation_matrix_table.csv`

---

## Status tags legend
- **VERIFIED**: backed by runtime execution artifacts and/or direct live DB evidence.
- **ASSUMED**: plausible from code intent but not fully proven in this run.
- **MISSING**: expected feature/storage element absent from live runtime state.
