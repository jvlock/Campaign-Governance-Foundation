# Architecture Decision: Greenfield Campaign Governance Foundation

## Proposed structure

- **Web:** React + TypeScript + Vite, with route-aware responsive application shell.
- **API:** TypeScript + Express, contract-first through OpenAPI and generated clients/validators.
- **Persistence:** PostgreSQL with Drizzle ORM, versioned SQL migrations, and an idempotent seed command.
- **Governed data:** normalized reference tables with stable IDs, business codes, status, source, and taxonomy version.
- **Documentation:** source assessment, architecture, material decision log, and implementation evidence.

The foundation exposes read-only readiness, activity, and taxonomy endpoints. Campaign creation, taxonomy administration, approvals, budgets, exports, and integrations are intentionally deferred.

## Domain direction

Future campaigns will receive an immutable, non-semantic Campaign Key generated independently from name, fiscal period, taxonomy, or channel. Products, segments, personas, regions, and channels will be many-to-many relationships. Human-readable names will be mutable display data. Referenced taxonomy rows will be retired or superseded rather than deleted.

## Database approach

PostgreSQL is authoritative. Drizzle schema files define tables and constraints; generated SQL migrations provide repeatable initialization. Seeds are idempotent and retain provenance. Current foundation tables are deliberately small:

- `taxonomy_values`: governed reference candidates with type, code, label, lifecycle status, source, version, and notes.
- `foundation_activity`: material decisions, assessments, and evidence surfaced on the home page.

Future campaign tables should separate enduring identity, mutable names, planning periods, budgets, audiences, products, regions, channels, approvals, and immutable audit events.

## Security boundaries

- Browser code does not receive database credentials.
- The API is the only persistence boundary.
- Request logs strip query strings and redact authorization/cookie headers.
- Error responses avoid stack traces and internal details.
- No PII or confidential data may be placed in URLs, UTMs, logs, campaign keys, or generated identifiers.
- Authentication, role-based authorization, and taxonomy stewardship are unresolved integrations and are not simulated in this phase.

## Testing approach

- Unit: pure naming, lifecycle, and validation rules as they are introduced.
- Database: schema constraints and seed idempotency against an isolated test database.
- API: health and contract smoke tests against the Express application.
- UI: route and empty-state component tests with mocked generated API hooks.
- End-to-end tests are deferred until a real workflow exists.

## Deployment approach

The web artifact is statically built and served through Replit routing. The shared API is a separate managed service under `/api`. Development uses the managed PostgreSQL database. Publishing applies supported schema changes to production; no startup-time DDL or custom production migration runner will be introduced.

## Risks and assumptions

- Source taxonomies are incomplete, inconsistent, and not steward-approved.
- Legacy identifiers may have downstream dependencies not visible in the supplied files.
- Future authorization and audit requirements may constrain schema and workflows.
- Budget currency, fiscal calendar, region hierarchy, and integration ownership are unresolved.
- Large legacy campaign histories will require a separately governed migration and reconciliation plan.

## Unresolved integrations

Salesforce, advertising platforms, email/Pardot, analytics, finance, identity, and data-warehouse integrations are explicitly excluded from this phase. Before implementation, each needs an owner, data contract, authentication method, error/retry policy, rate-limit plan, and reconciliation process.