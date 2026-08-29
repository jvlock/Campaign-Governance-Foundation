---
name: Published execution identity
description: Release identity and immutability rules for externally published campaign executions.
---

Once an execution is published externally, its material delivery content is immutable. Changed content must use a new execution version, and copies or versions must not inherit external platform IDs or sync state.

**Why:** Reusing an old external ID and idempotency key after changing content can incorrectly short-circuit delivery, while copying delivery IDs makes distinct executions falsely claim the same external object.

**How to apply:** Treat external IDs, sync state, and idempotency keys as execution-release identity. Preserve creative/copy lineage separately, but initialize delivery identity fresh for every copy or version.