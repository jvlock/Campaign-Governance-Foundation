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