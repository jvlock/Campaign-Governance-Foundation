# Decision Log

## 2026-08-28 — Greenfield boundary

**Decision:** Treat every supplied external file as immutable reference material. Do not continue the HTML structure, workbook formulas, macros, or any implied architecture.

**Reason:** The inputs contain useful business evidence but contradictory, incomplete, and channel-specific implementation choices.

## 2026-08-28 — Contract-first TypeScript stack

**Decision:** Use React/TypeScript, Express/TypeScript, OpenAPI-generated clients and validators, PostgreSQL, and Drizzle migrations.

**Reason:** This keeps browser, API, and persistence boundaries explicit while preventing contract drift.

## 2026-08-28 — Database-driven taxonomy categories

**Decision:** Store category metadata and governed values as records rather than authoritative UI arrays. Preserve the Phase 1 read-only reference table separately.

**Reason:** New product, segment, persona, channel, geography, and fiscal categories must be administrable without code changes while the Phase 1 public contract remains compatible.

## 2026-08-28 — Immutable identity and retained history

**Decision:** A governed value’s stable key cannot be edited. Display names and definitions may evolve through versioned, audited updates. Values are retired or superseded, never physically deleted.

**Reason:** Historical campaigns and downstream systems require enduring references even when business language changes.

## 2026-08-28 — Explicit lifecycle and concurrency

**Decision:** Enforce `draft → in_review → approved → active`, with retire, reactivate, and supersede actions gated by role, dates, parent state, and optimistic row versions.

**Reason:** A status field without transition rules, effective-date checks, or stale-write protection is not governance.

## 2026-08-28 — Replit OIDC and deny-by-default authorization

**Decision:** Use Replit OIDC/PKCE and server sessions. Bootstrap only the first administrator under a database lock; do not grant later authenticated users an implicit taxonomy role.

## 2026-08-28 — Public taxonomy administration

**Decision:** Supersede the earlier taxonomy authorization decision and make all taxonomy reads and administrative mutations public. Attribute unauthenticated changes to a shared `Public user` actor while retaining append-only audit records.

**Reason:** Authentication does not itself confer governance authority, and concurrent first logins must not create multiple bootstrap administrators.

## 2026-08-28 — Category-scoped stewardship

**Decision:** Roles may be scoped to specific taxonomy categories, with scope enforced by the API for reads and mutations.

**Reason:** Business ownership is distributed; a steward for one domain must not be able to inspect or change another domain through guessed record IDs.

## 2026-08-28 — Source-backed staging, never silent normalization

**Decision:** Parse selected preserved sources into persisted candidates with source locations. Generate review conflicts from those candidates and require structured resolution decisions.

**Reason:** Fixed preview fixtures cannot prove migration safety. The legacy `na` collision must remain visible and cannot be resolved by free text or implicit normalization.

## 2026-08-28 — Append-only governance evidence

**Decision:** Record actor-attributed snapshots for value mutations and governance events, and prevent audit-row updates or deletion with database triggers.

**Reason:** Application conventions alone do not make history immutable.

## 2026-08-28 — Phase boundary

**Decision:** Stop after Taxonomy Administration. Do not begin Campaign Registry or the newly supplied Campaign Setup Assistant in this task.

**Reason:** The setup brief explicitly depends on prior Campaign Registry evidence, which is not part of this delivered phase.


## 2026-08-28 — Campaign identity and hierarchy

**Decision:** Generate an immutable non-semantic campaign key and keep normalized mutable names solely for duplicate detection. Represent campaign, wave, activity, journey, event, sales-cadence, and newsletter relationships with explicit parent rules.

**Reason:** Names, periods, channels, and owners change; reporting identity and hierarchy cannot.

## 2026-08-29 — Enduring Campaign Key and normalized planning

**Decision:** Generate an opaque UUID Campaign Key once. Keep names, UTM labels, fiscal periods, audiences, products, and activities as mutable or versioned records beneath that key. Model audience dimensions and product roles separately rather than duplicating a campaign.

**Reason:** Renaming or crossing a fiscal year must not break identity, and multi-audience/multi-product reporting must not multiply campaign or cost facts.

## 2026-08-29 — One authoritative cost and exact minor-unit arithmetic

**Decision:** Store monetary values as integer minor-unit strings and calculate with `bigint`. A cost has one authoritative amount; segment, product, region, and channel attribution uses basis-point allocation rows. Use deterministic largest-remainder allocation so generated rows reconcile exactly.

**Reason:** JavaScript floating point cannot safely represent financial decimals, while duplicating cost facts for reporting dimensions overstates spend.

## 2026-08-29 — Published fiscal snapshots are immutable

**Decision:** Fiscal calendars have explicitly published, versioned snapshots containing their periods and boundaries. Existing campaign budgets reference a snapshot, not mutable calendar rules. Period status may close, but historical boundaries cannot change.

**Reason:** Non-calendar fiscal years and historical financial reports must remain reproducible after an administrator changes future calendar rules.

## 2026-08-29 — Closed-period control

**Decision:** Lock closed campaign planning periods in both API and database controls. Reopening requires a reason and named approver and creates immutable history.

**Reason:** Auditability requires enforced controls rather than UI convention, while legitimate correcting entries still need an approved path.

## 2026-08-28 — Versioned channel configuration and execution identity

**Decision:** Keep activities as campaign planning containers, define channel behavior through global versioned configurations, and model each reusable delivery execution with its own immutable UUID plus explicit copy/version lineage.

**Reason:** Administrators must be able to add future channel workflows without interface rewrites, while creative changes and reuse remain traceable without changing campaign identity or duplicating assets and costs.

## 2026-08-28 — Controlled MCP intent only

**Decision:** MCP activity configuration stores controlled intent categories and rejects raw prompt material recursively from destinations, analytics/external identifiers, answers, and execution lineage/configuration.

**Reason:** Raw prompts are unsafe and unstable analytics dimensions and must never be encoded into URLs or tracking parameters.

## 2026-08-30 — Derived planning and delivery context

**Decision:** Campaign planning-period responses include a nested projection of their immutable fiscal-period reference. Publish preview requests continue to accept only the delivery connection; campaign key, activity delivery dates, products, configuration, and immutable execution identity are derived by the server. Protected MCP payloads expose only controlled intent configuration.

**Reason:** Dependent workflow fields must reload consistently without clients guessing labels or submitting duplicated facts that can drift from governed campaign, fiscal, and execution records.

## 2026-08-28 — Shared cost and product associations

**Decision:** Associate each product once with a campaign and one explicit role. Store shared cost once on the campaign; activities may promote only a subset of parent products.

**Reason:** Joining a campaign to several products must not duplicate either the campaign or its shared cost.


## 2026-08-28 — Audience dimensions remain independent

**Decision:** Store each audience dimension as an independent selection. Preserve raw titles in source-evidence records, outside canonical persona values. Other, All, and Mixed-title remain unresolved and generate governance requests.

**Reason:** Personas, cohorts, account tiers, geography, and journey stage answer different questions and must report separately.


## 2026-08-28 — Task 6 boundary

**Decision:** Stop after Campaign Registry, guided setup, and multi-audience/multi-product planning. Do not implement downstream platform integrations or a product cost-allocation engine.

**Reason:** Those systems require separate ownership and contracts.

## 2026-08-28 — Explicit setup inheritance

**Decision:** Related-work answers are copied only after a user chooses to inherit them. Every copied audience value records inherited provenance and its source campaign.

**Reason:** Suggestions must not become silent selections, while activity creators should not re-answer approved campaign questions.
