# Florida Lotto Predictor

Web and API for Florida lottery statistics, model-backed predictions, and pattern analysis. The product targets a serious, data-forward experience (not novelty styling).

## Repository layout

- `client/` — Vite + React client
- `server/` — Node server (tRPC, predictions, draw ingestion)
- `shared/` — Shared types and game configuration
- `drizzle/` — Database schema and migrations
- `mobile/` — React Native prototype (see `mobile/AGENTS.md`)

## Development

```bash
pnpm install
cp .env.example .env
# Fill DATABASE_URL, JWT_SECRET, and other required values (see docs/DEPLOYMENT.md)
pnpm dev
```

Use `pnpm check` (TypeScript), `pnpm test` (Vitest), and `pnpm build` before shipping.

## Configuration

- **Local template:** `.env.example` lists variables with **required**, **optional**, and **legacy** groupings.
- **Hosted (Render):** see `docs/DEPLOYMENT.md` for the full table, migration notes for Forge/LLM names (`FORGE_API_URL` / `FORGE_API_KEY` vs. `BUILT_IN_FORGE_*`), and operational notes. `render.yaml` documents the same keys for review and disaster recovery.

## AI analysis

The Analysis tab calls an LLM when `FORGE_API_KEY` (or a supported alias) is set. If the key is missing or the provider errors, the API returns a **local summary** derived from stored draws and model performance so users do not see raw configuration errors.

## License

MIT (see `package.json`).
