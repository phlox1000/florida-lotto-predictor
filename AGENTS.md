# AGENTS.md

## Cursor Cloud specific instructions

### Overview
This is **Florida Lotto Predictor Web** — a full-stack Express + React (Vite) application for Florida Lottery number predictions using 18 statistical models. Single-package repo (not a monorepo).

### Required Services
| Service | Required | Notes |
|---------|----------|-------|
| MySQL 8.0 | Yes | Primary data store. Must be running before dev server starts. |
| Node.js/Express (the app) | Yes | Dev server on port 3000 via `pnpm dev`. |
| Manus OAuth | No | For login only; all public endpoints work without it. |
| Forge LLM API | No | For AI analysis features; core prediction models are pure math. |

### MySQL Setup
MySQL must be started manually in this environment (no systemd):
```bash
sudo mkdir -p /var/run/mysqld && sudo chown mysql:mysql /var/run/mysqld
sudo mysqld --user=mysql --datadir=/var/lib/mysql --socket=/var/run/mysqld/mysqld.sock --pid-file=/var/run/mysqld/mysqld.pid --log-error=/var/log/mysql/error.log &
sleep 3
```
Then create the database if it doesn't exist:
```bash
sudo mysql -u root -e "CREATE DATABASE IF NOT EXISTS florida_lotto;"
sudo mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password'; FLUSH PRIVILEGES;"
```

### Environment Variables
Create a `.env` file in the project root with at minimum:
```
DATABASE_URL="mysql://root:password@localhost:3306/florida_lotto"
JWT_SECRET="dev-secret-key-for-testing"
VITE_OAUTH_PORTAL_URL="http://localhost:3000"
VITE_APP_ID="florida-lotto-dev"
VITE_ANALYTICS_ENDPOINT=""
VITE_ANALYTICS_WEBSITE_ID=""
```
The `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` variables are required to prevent frontend `Invalid URL` errors. Setting them to dummy values is fine for development without OAuth.

### Key Commands
See `package.json` scripts. Summary:
- **Dev server**: `pnpm dev` (runs on port 3000 with Vite HMR)
- **Type check**: `pnpm check`
- **Tests**: `pnpm test` (vitest, server-side unit tests)
- **Build**: `pnpm build` (Vite + esbuild)
- **DB migrations**: `DATABASE_URL=... pnpm db:push`
- **Format**: `pnpm format` (prettier)

### Gotchas
- The `pnpm install` warning about build scripts for `@tailwindcss/oxide` and `esbuild` is resolved by the `pnpm.onlyBuiltDependencies` field in `package.json`. Run `pnpm rebuild` after install if native binaries are missing.
- Some tests (3 of 20 files) have pre-existing failures unrelated to environment setup: `versioning.test.ts`, `offline-features.test.ts`, `schedule.test.ts`.
- The app gracefully handles missing `DATABASE_URL` — the DB layer returns empty arrays. But for full functionality, MySQL must be running.
- OAuth warnings at startup (`[OAuth] ERROR: OAUTH_SERVER_URL is not configured!`) are harmless and expected in local dev without an OAuth server.
