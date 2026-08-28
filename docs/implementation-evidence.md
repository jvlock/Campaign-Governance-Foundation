# Implementation Evidence

## Delivered scope — 2026-08-28

- Standalone Campaign Governance web artifact and shared Express API.
- OpenAPI contract with generated React Query hooks, model types, and Zod validators.
- Replit OIDC/PKCE login, server sessions, current-user/logout routes, and browser auth state.
- Deny-by-default role authorization with atomic first-administrator bootstrap and category scopes.
- 37 database-defined taxonomy categories and 37 provenance-labeled governed draft seeds.
- Governed-value list, search, filters, create, edit, detail, hierarchy, associations, lifecycle, supersession, usage visibility, and audit history.
- Review-request queue and creation flow.
- Runtime parsing and persisted staging for all three preserved source profiles.
- Explicit import conflict decisions, including the actual `na` source at `Definitions!R43C5`.
- Retained-value policy in both UI and API; there is no permanent-delete workflow.
- Immutable audit and governance-event tables protected by PostgreSQL triggers.

All supplied files under `reference-materials/` remain source evidence and were not modified.

## Database and migrations

- Baseline migration remains unchanged.
- Forward migrations add authentication, governance, self-referencing integrity constraints, import candidates, governance events, effective-date checks, and append-only audit triggers.
- Development schema was reconciled with Drizzle push because the existing development database predated Drizzle’s migration journal.
- Clean environments can apply the versioned migration files.
- Production uses Replit Publish’s schema-diff flow.

## Verification

- OpenAPI code generation: passed.
- Full TypeScript project check: passed.
- API and web managed workflow restarts: passed.
- Database-aware health endpoint: HTTP 200.
- Automated smoke suite: **14 passed, 0 failed**.
- Desktop browser E2E: passed.
  - Auth gate and OIDC bootstrap
  - database list and filters
  - create and rename with stable-key retention
  - created/updated actor audit
  - submit, approve, and activate lifecycle
  - retention-policy dialog
  - source-backed workbook preview and conflict view
  - review-request form
- Tablet browser E2E at 820×1180: passed.
  - no document-level horizontal overflow on list, detail, imports, or review requests
  - keyboard navigation and modal focus trapping
  - usable lifecycle, import, and request controls
- No application-breaking browser or backend errors were observed. Development-only Vite HMR websocket warnings were observed through the proxy and did not affect application behavior.

Browser evidence captured by the automated tester:

- Desktop list: `efslcb`
- Desktop active detail and audit history: `t3t4cd`
- Desktop import conflicts: `ajcvdf`
- Desktop review-request form: `czj7m3`
- Tablet list: `svllsb`
- Tablet active detail: `92z040`
- Tablet retention dialog: `t9gksz`
- Tablet imports: `hmvoe1`
- Tablet review requests: `j99ow3`
- Tablet request dialog: `rmxpmy`

The temporary OIDC test identity, sessions, and taxonomy role were removed after testing. The secure first-administrator bootstrap remains available to the first real user.

## Acceptance evidence

1. Database-driven administration across supplied categories — **passed**.
2. Stable keys remain immutable during label changes — **passed**.
3. Definitions, owners, versions, dates, provenance, and legacy codes are editable metadata — **passed**.
4. Hierarchy, associations, category scope, and cycle/reference integrity — **passed**.
5. Lifecycle transitions, temporal rules, retirement, reactivation, and supersession — **passed**.
6. Optimistic concurrency and immutable actor-attributed history — **passed**.
7. Usage visibility and physical-delete protection — **passed**.
8. Source-backed previews and explicit conflict resolution without silent overwrites — **passed**.
9. Review requests instead of ungoverned catch-all creation — **passed**.
10. Responsive, keyboard-usable administration UI — **passed**.

## Known gaps and phase boundary

- Business owners must review seeded drafts before activation; source materials are not treated as enterprise truth.
- Role assignment has an API/database model but no dedicated role-management screen in this phase.
- Import preview stages and reviews candidates; no batch applies source candidates directly to active values.
- Campaign Registry and Campaign Setup Assistant are not implemented. The newly supplied setup brief depends on a Campaign Registry phase and must follow it.
- Budgeting, campaign creation, reporting, and live integrations remain out of scope.