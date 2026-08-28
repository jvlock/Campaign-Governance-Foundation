# Architecture: Campaign Governance, Planning, and Taxonomy Administration

## System structure

- **Web:** React, TypeScript, Vite, Wouter, TanStack Query, and accessible component primitives.
- **API:** TypeScript and Express, with OpenAPI as the contract source of truth.
- **Generated boundaries:** Orval generates React Query hooks and server-side Zod validators from the OpenAPI document.
- **Persistence:** PostgreSQL with Drizzle schema definitions, versioned SQL migrations, and idempotent seeds.
- **Authentication:** Replit OpenID Connect with PKCE, server-side sessions, browser cookies, and bearer-session support for non-browser clients.

The product now includes Campaign Registry, resumable guided-setup drafts, normalized audience/product planning, fiscal snapshots, multi-period budgeting, and configurable channel activities with reusable executions. Reporting and live business-system integrations remain outside this phase.

## Campaign identity and setup

`campaigns.campaign_key` is a generated UUID and the enduring campaign identity. It is never calculated from a name, date, fiscal year, or UTM label, and a database trigger prevents changing it. Mutable names and automatically generated planning-period names are attributes beneath that identity. Waves, activities, and copied campaigns retain explicit source relationships; inherited setup, audiences, and products are copied visibly into a new draft without changing either campaign's identity.

Draft setup captures the business-language campaign type, relationship, objective, customer need, desired action, dates/evergreen review, delivery summary, and extensible step data. Readiness checks required answers, a primary segment, persona and product coverage, date consistency, and probable duplicates before submission. Audience selections are normalized by dimension; personas, buying-group functions, messaging cohorts, geography, language, relationship and journey stage remain independently reportable.

Products are many-to-many with explicit roles. Activities may select a subset. `campaign_costs.authoritative_amount_minor` is the single cost fact; product, segment, region, and channel rows are allocation dimensions and cannot create another authoritative cost.

Activity create/update APIs retain delivery start/end separately from the optional accounting date, enforce product subsets against the campaign plan, and reject mutation when an existing allocation touches a closed period. Authoritative campaign costs have dedicated create/update APIs. Their reporting allocations use integer basis points: every represented dimension must independently total exactly 10,000 (100%). Totals are never added across dimensions, so a cost attributed across product, segment, region, and channel still contributes only its one authoritative amount to campaign spend.

## Configurable channel activities and executions

Activities remain planning containers beneath the enduring Campaign Key. Each has its own opaque UUID Activity Key, optional parent/wave relationship, governed channel, owner/source/platform facts, delivery and accounting dates, audience treatment, product subset, locale, CTA/destination, reusable asset references, external identifiers, exact budget, status, and optimistic version.

Global activity-type configurations are versioned independently of campaigns. A published configuration supplies database-driven questions, conditional requirements, validation rules, a naming template, member statuses, inheritance fields, and permitted overrides. Existing activities retain the selected configuration ID and version so later configuration versions cannot silently reinterpret historical answers. The initial seed covers email, paid search, paid social, display/content partnerships, organic social, employee advocacy, events, sales cadences, in-app, MCP, website, and partner marketing.

Executions are many-to-one beneath an activity. Each execution receives an immutable UUID Execution Key and records its own status, version, creative/copy lineage, reusable asset IDs, platform facts, and optimistic version. Copying creates a new key with `copiedFromExecutionKey`; versioning creates a new key with `previousVersionExecutionKey` and an incremented version. Asset IDs are referenced rather than duplicated.

MCP configurations require a controlled intent category and `rejectRawPrompt` policy. MCP classification comes from that durable policy or the governed MCP channel—not a configuration-name convention. API validation recursively rejects raw-prompt keys or values in activity answers, destinations, external identifiers, and execution configuration/lineage, so prompt text cannot leak into URLs or analytics parameters.

## Fiscal planning and money

Money crosses API and persistence boundaries as base-10 integer minor-unit strings. Calculations convert those strings to `bigint`; floating-point arithmetic is never used. Largest-remainder allocation produces deterministic exact totals for even, monthly/day-weighted, quarterly, and custom allocations. The model separately stores requested, approved, planned, committed, actual, and forecast; remaining and variance are derived from exact integers.

Administrators publish immutable versions of configurable fiscal calendars. Each snapshot contains explicit fiscal year, quarter, period, start/end dates and status, so later rule changes cannot rewrite historical boundaries. Campaign dates select every touched period and create stable campaign-planning-period keys below the unchanged Campaign Key. Evergreen campaigns plan through their required review date.

Activities preserve delivery dates and an optional accounting date. Cross-period costs support invoice-date, daily, monthly, and exactly reconciled custom allocation. Closed planning periods reject value changes and activity allocation. Reopening changes only the lock state and requires both a reason and named approver; every budget mutation stores an append-only snapshot.

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

Approval workflow beyond setup submission and period reopening, reporting, Salesforce/Pardot, media platforms, analytics, finance-system posting, and data-warehouse integrations require separately approved contracts and ownership. No simulated integration is presented as production behavior.