# Campaign Governance

A greenfield, segment-led workspace for governing integrated Sales and Marketing campaigns.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run generate` — generate a versioned SQL migration
- `pnpm --filter @workspace/scripts run seed:foundation` — seed foundation data idempotently
- `pnpm --filter @workspace/scripts run seed:taxonomy` — seed governed taxonomy drafts idempotently
- `pnpm --filter @workspace/scripts run test:smoke` — run unit, database, API, and UI smoke tests
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/campaign-governance` — responsive React application and Taxonomy Administration
- `artifacts/api-server` — Express API and structured error handling
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/db/src/schema` — source of truth for PostgreSQL schema
- `reference-materials` — immutable external inputs, never production code
- `docs` — source assessment, architecture, decisions, and implementation evidence

## Architecture decisions

- This is a greenfield build; supplied files are immutable references only.
- Governed taxonomy values are persistent versioned records, never page-level arrays.
- OpenAPI is the contract source of truth; regenerate clients and validators after every contract change.
- Taxonomy administration is intentionally public, including create, update, lifecycle, association, review-request, and import operations.
- Public taxonomy audit records use the actor label `Public user`; authentication is not required for taxonomy routes.
- Campaign identity is an enduring generated UUID independent of names and fiscal periods.
- Referenced taxonomy values are retired or superseded, not deleted.
- Audit and governance events are append-only.
- Preserved-source imports stage real parsed candidates and structured conflicts; they never auto-activate values.
- Campaign Registry, setup drafts, normalized plans, and fiscal budgeting are available through the API; live business integrations remain deferred.

## Product

The current backend phase provides Taxonomy Administration, Campaign Registry and guided-setup persistence, normalized audience/product planning, and multi-year fiscal budgeting. The existing frontend remains taxonomy-focused. Reporting and live integrations are deferred.

## User preferences

- Do not use or continue other builds.

## Gotchas

- Treat all imported values as incomplete draft seeds until a steward approves them.
- Regenerate API code after every OpenAPI change.
- Do not put confidential values in query strings or logs.
- Browser cookie mutations require a same-origin request; bearer sessions are intended for non-browser clients.
- Do not create a permanent-delete path for governed values or audit records.
- The `na` legacy code must be explicitly resolved to a governed target or not-applicable decision.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
