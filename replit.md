# Campaign Governance

A greenfield, segment-led workspace for governing integrated Sales and Marketing campaigns.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run generate` — generate a versioned SQL migration
- `pnpm --filter @workspace/scripts run seed:foundation` — seed draft reference values idempotently
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/campaign-governance` — responsive React application shell
- `artifacts/api-server` — Express API and structured error handling
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/db/src/schema` — source of truth for PostgreSQL schema
- `reference-materials` — immutable external inputs, never production code
- `docs` — source assessment, architecture, decisions, and implementation evidence

## Architecture decisions

- This is a greenfield build; supplied files are immutable references only.
- Governed taxonomy values are persistent versioned records, never page-level arrays.
- Campaign identity will be an enduring non-semantic key independent of names and fiscal periods.
- Referenced taxonomy values are retired or superseded, not deleted.
- Live business integrations are deferred beyond the foundation phase.

## Product

The current phase provides the application shell, governed seed visibility, readiness evidence, database-aware health, and intentional empty routes for future workflows.

## User preferences

- Do not use or continue other builds.

## Gotchas

- Treat all imported values as incomplete draft seeds until a steward approves them.
- Regenerate API code after every OpenAPI change.
- Do not put confidential values in query strings or logs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
