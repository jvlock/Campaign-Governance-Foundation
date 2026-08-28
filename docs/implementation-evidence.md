# Implementation Evidence

## 2026-08-28

- Created a standalone Campaign Governance web artifact and shared API contract.
- Preserved all supplied external files byte-for-byte in `reference-materials/`; SHA-256 comparisons matched their uploaded sources.
- Inspected every workbook worksheet, workbook metadata, formulas, validations, lookup structures, hidden sheets, and the complete HTML logic.
- Generated typed React Query hooks and server-side Zod schemas from OpenAPI.
- Added PostgreSQL governed-reference and foundation-activity tables.
- Applied the development schema through Drizzle and inserted idempotent, provenance-labeled draft seeds.
- Added database-aware health reporting, structured errors, and read-only foundation endpoints.
- Recorded source, architecture, and material decisions in project documentation.

## Commands run

- `pnpm --filter @workspace/api-spec run codegen`
- `pnpm install`
- `pnpm --filter @workspace/db run push`
- `pnpm --filter @workspace/db run generate`
- `pnpm --filter @workspace/scripts run seed:foundation`
- `pnpm run typecheck`
- `pnpm --filter @workspace/scripts run test:smoke`
- Managed API and web workflow restarts

## Verification results

- Clean dependency install: passed.
- Full TypeScript project check: passed.
- Generated initial SQL migration: passed.
- Idempotent seed command: passed.
- API health: HTTP 200; application and database both reachable.
- Smoke tests: 4 passed, 0 failed (unit, database, API, and UI categories).
- Web and API workflows: running without application errors.
- Browser console: no application errors.
- Desktop shell capture: `screenshots/campaign-governance-desktop.jpg`.
- Tablet shell capture: `screenshots/campaign-governance-tablet.jpg`.

## Acceptance criteria

1. New standalone Replit application with no prior app/repository dependency — **passed**.
2. Starts successfully from a clean dependency install — **passed**.
3. Database can be initialized and migrated without manual edits — **passed**; schema source, initial SQL migration, migration command, and idempotent seed command exist.
4. Shell renders at desktop and tablet widths — **passed**.
5. Navigation routes and intentional empty states — **passed**.
6. Health confirms application and database reachability — **passed**.
7. Automated smoke tests — **passed**.
8. Source assessment, architecture, decision, and evidence documents — **passed**.
9. Reference files remain unchanged — **passed**; source and preserved-copy SHA-256 manifests matched.

## Known gaps

- Authentication, role authorization, taxonomy stewardship, fiscal calendar, regional hierarchy, campaign workflows, budgets, approvals, reporting, and live integrations remain intentionally unimplemented.
- Seed values are incomplete drafts and must not be activated without business-owner review.
- Migration was generated as the clean-install baseline; destructive downgrade automation is intentionally absent.
- End-to-end workflow testing is deferred until the first governed workflow is approved.