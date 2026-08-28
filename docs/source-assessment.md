# Source Assessment

## Scope and status

This is a greenfield Replit application. No prior Replit application, repository, technical architecture, database, or production interface exists. The supplied HTML and workbooks were created outside Replit and are preserved unchanged under `reference-materials/`. They are evidence and seed inputs—not an application to continue or a specification to copy.

## Reference inventory

### Foundation prompt

`Pasted-Prompt-1-Create-the-new-application-and-establish-its-f_1787933310350.txt`

Defines the foundation-only scope, target stack, primary navigation, acceptance criteria, and non-negotiable domain rules. It is the controlling input for this phase.

### Target segments, personas, and cohorts

`Target_Segments_Personas_Cohorts_1787933333641.xlsx`

- Three visible sheets: `Consol Messaging`, `AO Final`, and `HF Final`.
- Contains example segment, size-tier, title, persona, and cohort mappings.
- Reusable candidate values include size tiers (`Very Large`, `Large`, `Medium`, `Small`, `All`) and persona labels such as `Finance & Executive Leadership`, `Investment Decision-Makers`, and `Risk & Compliance`.
- `AO Final` describes 1,185 confirmed outreach contacts, but the visible grouped examples do not reconcile transparently to that total.
- No formulas, validations, named ranges, or hidden governance logic establish these values as authoritative.
- Labels contain variants, mixed singular/plural usage, blanks, duplicates, and at least one apparent title typo. Cohort names are presentation labels rather than stable identifiers.

**Assessment:** useful as incomplete audience seed data and mapping examples only. Contact counts and title-level rows must not be imported as governed enterprise truth, and source rows must be reviewed for confidentiality before future use.

### Taxonomy Builder workbook

`Taxonomy_Builder_Final_(1)_1787933333643.xlsm`

- A macro-enabled workbook with 27 worksheets spanning instructions, definitions, campaign hierarchies, Salesforce campaign exports, channel-specific builders, planning archives, and lookup fields.
- Hidden sheets include historical and planning material such as `Main Forms SF Campaigns`, `Sub Campaigns Full Names`, `2025 Campaign Hierarchy Archive`, `2026 Planning`, and `Channel Grouping Logic`.
- Candidate reusable concepts include campaign hierarchy levels, channel groupings, objectives, audiences, product lines, Salesforce fields, UTM fields, and channel-specific naming examples.
- Much of the workbook is operational history, brainstorming, formula-driven concatenation, or channel-specific export formatting rather than a normalized governance model.
- Workbook formulas frequently build names positionally. This conflicts with the new requirement that products, segments, personas, regions, channels, and fiscal periods be related data rather than encoded identity.
- Hidden and archive sheets demonstrate changing conventions over time but do not provide explicit ownership, effective dates, compatibility guarantees, or retirement rules.

**Assessment:** useful for discovering terminology, legacy integrations, examples, and migration risks. It is not a database schema, authoritative taxonomy, or technical architecture. Macros and formulas are not carried into production code.

### Public UTM guide HTML

`MSCI_UTM_Guide_Public_3_1787933333643.html`

- A large standalone HTML prototype containing UI, reference guidance, channel forms, controlled arrays, JavaScript validation, naming logic, URL generation, and CSV export.
- Stores working state only in browser memory; reload and channel changes can delete work. No server persistence, audit history, approval workflow, taxonomy version, or compatibility contract exists.
- Candidate reusable concepts include standard UTM dimensions, lower-case conventions, channel groupings, campaign-only modes, channel-specific required fields, and exclusion of confidential data from URLs.
- Campaign and URL identifiers can change when newsletter links, nurture sequences, rows, or variants are renumbered. This conflicts with enduring campaign identity.
- `notes` is appended without safe encoding; source examples contradict lower-case guidance; the CSV omits several nonstandard fields and can emit the wrong source for some channels.
- The 1-click form reference documents `utm_interests`, while the builder exposes different form fields. Display term guidance and implementation differ. Newsletter date validation checks a shared field while generation uses per-version dates. Nurture guidance discusses five messages but the UI permits an unbounded count.
- Salesforce/Pardot attribution fields, privacy boundaries, field ownership, taxonomy versioning, and analytics ingestion guarantees remain unresolved.

**Assessment:** valuable for enumerating legacy business rules and contradictions. Its single-file structure, in-memory state, and hardcoded channel arrays are explicitly not reused as architecture.

## Potentially reusable rules

1. UTM and generated URL values must never contain personally identifiable or confidential information.
2. Controlled values need business-readable labels, stable identifiers, provenance, status, version, and lifecycle.
3. Channel-specific requirements may exist, but channels must reference governed data rather than own hardcoded copies.
4. Campaign names should remain understandable without a code guide.
5. Historical values must be retained through retirement or supersession when referenced.
6. Existing channel, objective, audience, product, segment, persona, and region labels can seed steward review queues.

## Conflicts and risky assumptions

- Product-first, encoded naming in the references conflicts with the segment-led relational target model.
- Positional or sequence-based identifiers conflict with an enduring Campaign Key.
- Fiscal year/quarter appears in legacy names but cannot define campaign identity.
- The workbooks mix current, archived, draft, export, and brainstorming content without reliable status metadata.
- “Channel,” delivery platform, source, medium, campaign hierarchy, and Salesforce campaign are sometimes conflated.
- Audience cohorts are not consistently normalized and their stated counts need reconciliation.
- The references do not define taxonomy stewards, approval authority, version compatibility, or effective dating.
- No source provides a complete region model, enterprise product catalog, retention policy, or access-control matrix.
- No source proves that its lookup lists are complete.

## Seed-data policy

All imported values are labeled with source, status, and taxonomy version. They begin as `draft`, remain incomplete, and require steward review before activation. Example titles, contact counts, archived campaign names, and generated URLs are not imported as production records.

## Unresolved questions

- Which system is authoritative for products and Salesforce campaign hierarchy?
- Who owns each taxonomy type and approves activation, retirement, and supersession?
- What fiscal calendar and region model are authoritative?
- Which channel parameters are contractual analytics inputs versus legacy conveniences?
- What identity and role provider will enforce administrative and approval boundaries?
- Which finance system owns budgets and actuals, and at what aggregation level?