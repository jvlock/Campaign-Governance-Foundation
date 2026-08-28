# Architecture: Campaign Governance and Taxonomy Administration

## System structure

- **Web:** React, TypeScript, Vite, Wouter, TanStack Query, and accessible component primitives.
- **API:** TypeScript and Express, with OpenAPI as the contract source of truth.
- **Generated boundaries:** Orval generates React Query hooks and server-side Zod validators from the OpenAPI document.
- **Persistence:** PostgreSQL with Drizzle schema definitions, versioned SQL migrations, and idempotent seeds.
- **Authentication:** Replit OpenID Connect with PKCE, server-side sessions, browser cookies, and bearer-session support for non-browser clients.

The current delivered product includes the responsive application shell and database-driven Taxonomy Administration. Campaign setup, campaign registry, budgeting, reporting, and live business-system integrations remain outside this phase.

## Governed taxonomy model

Taxonomy category metadata is stored in the database, so adding categories does not require adding page-level arrays. Governed values have:

- an immutable `stableKey` independent of their mutable display name;
- category, definition, owner, source, taxonomy version, legacy codes, and optional measurement rules;
- effective start and end dates;
- lifecycle state and optimistic `rowVersion`;
- optional governed parent and superseding-value references;
- usage visibility and retained history.

Lifecycle is explicit: `draft → in_review → approved → active`, with `inactive` and `superseded` outcomes. Values are retained rather than physically deleted. Parent cycles, unsupported parent categories, invalid effective-date ranges, inactive parents, and invalid supersession targets are rejected at the API boundary. Database foreign keys protect parent, association, supersession, category, review, and import references.

## Authorization

All taxonomy routes are intentionally public, including administrative mutations. The taxonomy access endpoint exposes administrator-equivalent capabilities to every caller, and the UI has no authentication gate.
- Role order is `reader`, `contributor`, `reviewer`, `steward`, `administrator`.
- Optional category scopes are enforced for list, detail, history, hierarchy, association, review-request, and lifecycle operations.
- The API, not the browser, is the enforcement boundary.

Browser mutations require a matching `Origin`; bearer-authenticated clients bypass this CSRF check. Arbitrary credentialed CORS reflection is not enabled.

## Audit and concurrency

Every governed-value mutation stores the public actor, reason, and resulting snapshot. Association creation, import previews, and conflict resolutions also write governance events. Audit tables are append-only through PostgreSQL triggers. Update and lifecycle requests include `rowVersion`, and stale writes return `409`.

## Controlled source imports

Files under `reference-materials/` remain immutable evidence. Import preview requests parse the selected preserved workbook or HTML at runtime:

- the audience workbook stages controlled values only from the aggregated `Consol Messaging` sheet, not contact/title rows;
- the taxonomy workbook stages definitions plus source/medium/channel candidates from named source sheets;
- the HTML guide stages channel/source/delivery candidates from its documented channel cards.

Candidates are persisted with source locations and raw source context. They never become active values automatically. Conflicts are generated from the parsed data for ambiguous codes, catch-all labels, duplicates, and missing definitions. The legacy `na` value is traced to `Definitions!R43C5` and requires an explicit decision: map to a selected governed value or mark not applicable. Free-text notes alone cannot resolve it. A batch becomes reviewed only after all conflicts are resolved or intentionally ignored.

## Testing and operation

- Unit tests cover role ordering, stable-key semantics, and ambiguous-code policy.
- Database tests verify governed categories, draft seeds, audit records, and unique stable keys.
- API tests exercise real session-backed actors, authorization, creation without code changes, optimistic concurrency, history, lifecycle, retention, source-backed import preview, and explicit conflict resolution.
- Browser tests exercise Replit OIDC login, list/filter, create/edit, lifecycle, retained-history messaging, import conflicts, review requests, keyboard focus, and tablet layout.
- Production schema changes use Replit Publish’s supported database-diff flow; the app performs no startup-time DDL.

## Deferred systems

Campaign Registry, guided Campaign Setup, approvals outside taxonomy lifecycle, budgets, reporting, Salesforce/Pardot, media platforms, analytics, finance, and data-warehouse integrations require separately approved contracts and ownership. No simulated integration is presented as production behavior.