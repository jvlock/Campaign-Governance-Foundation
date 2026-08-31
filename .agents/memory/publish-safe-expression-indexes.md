---
name: Publish-safe expression indexes
description: Why complex PostgreSQL expression indexes should use generated columns before Publish schema diffing.
---

Avoid multi-argument SQL expressions such as `regexp_replace(..., ..., ..., ...)` directly inside indexes that must flow through Replit's development-to-production schema diff. Put the expression in a stored generated column and build an ordinary index from column names instead.

**Why:** The development index can be valid while publish-time introspection serializes the expression incorrectly, dropping quoted arguments and producing invalid SQL. Generated-column expressions survive introspection, and the resulting index definition contains only simple identifiers.

**How to apply:** When a publish diff shows malformed SQL for a valid development expression index, confirm the live development definition first, check production for conflicting rows read-only, then replace the expression index in the schema source with generated columns plus a conventional index. Recompute the Publish diff before retrying.