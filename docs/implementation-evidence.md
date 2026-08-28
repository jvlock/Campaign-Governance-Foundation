# Implementation Evidence

## Delivered scope — 2026-08-28

- Standalone Campaign Governance web artifact and shared Express API.
- OpenAPI contract with generated React Query hooks, model types, and Zod validators.
- Replit OIDC/PKCE login, server sessions, current-user/logout routes, and browser auth state.
- Intentionally public taxonomy administration, including all mutation and import operations.
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
- Automated smoke suite: **23 passed, 0 failed**.
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

Taxonomy routes and administration screens require no login. Public changes are attributed to the shared `Public user` audit actor.

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
- Reporting, finance posting, campaign approval beyond submission, and live integrations remain out of scope.

## Campaign planning and budgeting evidence — 2026-08-29

Delivered backend foundations:

- Registry CRUD/search/detail with an immutable, non-semantic UUID Campaign Key.
- Guided-setup draft persistence, inheritance for waves/activities/copies, readiness issues, duplicate candidates, and submission.
- Normalized audience dimensions, one primary segment, multiple personas/functions, raw-title evidence, planning-count warnings, account-size measurement basis, and governance requests for unresolved classifications.
- Multi-product associations and activity subsets without campaign duplication; a separate authoritative-cost fact with basis-point reporting dimensions.
- Contract-first activity create/update endpoints preserve delivery/accounting dates and enforce that promoted products are a subset of campaign products.
- Contract-first authoritative-cost create/update and dimension-replacement endpoints require each represented product, segment, region, or channel view to reconcile to exactly 10,000 basis points; invalid 9,999-basis-point input is covered by API tests.
- Campaign detail is reload-complete: it includes activities with product subsets and activity-period allocations, plus authoritative costs with their reporting dimensions. The active-fiscal-snapshot endpoint returns the immutable published snapshot and its explicit ordered period boundaries.
- Configurable versioned fiscal snapshots and explicit non-calendar periods.
- Automatic touched-period generation for dated and evergreen campaigns.
- Exact integer-minor-unit allocation for even, month/day-weighted, quarterly, and custom planning plus invoice-date, daily, monthly, and custom activity splits.
- Requested, approved, planned, committed, actual, forecast, derived remaining and variance.
- Closed-period locks, approved reopening, variance explanation, expire/carry-forward decision, and append-only campaign/budget history.

Calculation example: USD 100.01 is represented as `"10001"`. An even two-period allocation produces `"5001"` and `"5000"` in deterministic period order, totaling exactly `"10001"`. No binary floating-point value is introduced. A February-start fiscal snapshot covering 2030-02-01 through 2030-04-30 generates two planning periods beneath the same Campaign Key.

Verification completed in this implementation pass:

- OpenAPI generation: passed.
- Full workspace TypeScript check: passed.
- Automated smoke suite: **23 passed, 0 failed**.
- A focused API test now covers a non-calendar snapshot and its active-snapshot read response, reload-complete campaign detail, registry draft, normalized audience/product plans, activity creation/update and product subsets, authoritative shared cost, exact percentage dimensions, closed-period cost locking, readiness, a 10,001-minor-unit budget, exact allocation, and unchanged Campaign Key. A second API test covers an evergreen campaign whose review date crosses the explicit 2032-02-29 leap-day boundary.
- Database tests verify campaign/planning tables, immutable-key and append-only-history controls, the forward closed-period lock migration, and transactional `FOR UPDATE` protection on financial mutation routes.
- Database tests also verify that published fiscal snapshots reject later period inserts and permit only the one-way unpublished-to-published transition.
- Production campaign and finance mutations require an authenticated actor; audit attribution is session-derived, and period reopening is restricted to the interim administrator approval role.
- Campaign initialization retains its created Campaign Key if initial budget setup fails and retries against that identity rather than creating a duplicate.
- Frontend currency parsing, aggregation, subtraction, and formatting use decimal strings and `bigint` minor-unit arithmetic.
- Desktop browser E2E verified real governed product cost allocation, exact persisted percentage metadata, live query refresh, planning-period updates, required reconciliation and reopen approval forms, close/reopen locking, financial audit history, registry search, and unchanged Campaign Key.
- Browser/backend logs were clean during the final close/reopen and audit-history pass.

Campaign planning screenshots saved in `docs/screenshots/`:

- `fiscal-calendars.jpg` — active immutable non-calendar fiscal snapshot and explicit period boundaries.
- `campaign-planning-workspace.jpg` — enduring Campaign Key, readiness, audiences/products, and budget summary.
- `campaign-registry.jpg` — searchable campaign registry retaining one Campaign Key.

Automated browser evidence:

- Audience/product plan: `7fmad6`
- Exact financial-period allocation: `jumpvh`
- Cross-period activity allocation: `esp60l`
- Persisted authoritative-cost product allocation: `xv78fo`
- Close/reopen state: `5i0r8r`
- Financial audit trail after approved reopen: `i07oxb`
- Registry search with unchanged Campaign Key: `oit0p5`

Unresolved finance-policy questions:

1. Which roles or external approval system may approve budgets and reopen periods in production?
2. Is remaining budget defined as approved minus actual and committed, or should open purchase orders and accruals be treated separately?
3. Should forecast mean total expected final spend or only spend not yet actualized?
4. Which currencies with nonstandard minor units are permitted, and who owns currency precision changes?
5. Is carry-forward automatic, capped, or subject to a new approval and funding-source restriction?
6. Which accounting date wins when invoice, service, posting, and payment dates differ?
7. Are negative corrections allowed after close, and if so must they use a correcting period rather than reopening?
8. For month allocation, should partial months be day-weighted or treated as equal active months? The current activity monthly method treats active months equally; campaign monthly allocation is day-weighted across explicit periods.

## Configurable channel activity and execution evidence — 2026-08-28

Delivered:

- Versioned global configurations for all 12 initial channels, with database-driven conditional questions, validations, naming templates, member statuses, inheritance, and permitted overrides.
- Expanded activities with stable UUID keys, parent/wave linkage, configuration snapshots, owner/source/platform, dates, audience treatment, product subsets, locale, CTA/destination, assets, exact budget, statuses, external identifiers, and optimistic concurrency.
- Stable execution UUIDs with status edits, version numbers, reusable asset references, creative/copy facts, external identifiers, copy lineage, and previous-version lineage.
- Contract-first configuration administration, execution CRUD/copy/version endpoints, generated Zod validators, and generated React Query clients.
- Campaign detail reloads configurations, activity products and fiscal allocations, plus all execution lineage.
- MCP validation derives protection from explicit configuration policy or the governed MCP channel, requires controlled intent categories, and rejects raw prompt keys or values from activity and execution data even when a configuration uses a different stable key.
- An idempotent forward integrity repair restores migration-only constraints and triggers in development databases originally created through schema push.

Verification:

- OpenAPI code generation passed.
- Full workspace TypeScript and production API/web builds passed.
- API suite: **14 passed, 0 failed**, including conditional configuration, effective status rules, contiguous fiscal coverage, exact automatic create/update allocation, allocation-scoped period locking, MCP prompt safety, asset reuse, stale execution rejection, copy/version lineage, and reload persistence.
- Database suite: **14 passed, 0 failed**, including stable execution keys, all channel seeds, the activity/configuration foreign key, idempotent forward migrations, fiscal immutability, append-only history, and closed-period controls.
- Browser E2E passed for configuration browsing, MCP governance, inherited dates/products, visible standard activity fields, email activity creation, two-asset execution creation, execution status editing, copy, version, reload persistence, and a 390×844 responsive pass.
- Browser evidence: MCP configuration `19vikz`; completed execution edit `9an75s`; persisted execution lineage `zd2ey7`; final mobile layout `8r4r1h`.
- Saved live preview: `docs/screenshots/channel-activities-final.jpg`.
- Independent architecture review passed after the configuration, MCP, fiscal coverage, status-default, and schema-alignment hardening.

Known gaps:

- This phase records external platform identifiers but does not create or synchronize records in email, advertising, event, sales, or analytics systems.
- Asset IDs are reusable governed references; binary asset storage and asset-library administration remain separate concerns.