# Decision Log

## 2026-08-28 — Greenfield boundary

**Decision:** Treat every supplied external file as immutable reference material. Do not continue the HTML structure, workbook formulas, or any implied architecture.

**Reason:** The inputs contain useful business evidence but contradictory, incomplete, and channel-specific implementation choices.

## 2026-08-28 — Contract-first TypeScript stack

**Decision:** Use React/TypeScript, Express/TypeScript, OpenAPI-generated clients and validators, PostgreSQL, and Drizzle migrations.

**Reason:** This keeps browser, API, and persistence boundaries explicit and supportable while preventing contract drift.

## 2026-08-28 — Governed values are persistent records

**Decision:** Store taxonomy candidates in reference tables with stable IDs, source, status, and version. Do not embed authoritative arrays in page components.

**Reason:** Taxonomy lifecycle, provenance, and historical compatibility cannot be governed in hardcoded UI lists.

## 2026-08-28 — Foundation-only surface

**Decision:** Ship navigation, intentional empty states, readiness evidence, health, and read-only reference data. Defer campaign and taxonomy mutation workflows.

**Reason:** The requested phase ends at a verified foundation; inventing unresolved workflows would harden risky assumptions.