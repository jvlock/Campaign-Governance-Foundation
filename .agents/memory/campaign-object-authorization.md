---
name: Campaign object authorization
description: The ownership boundary for campaign-scoped and global governance routes.
---

Resolve every campaign-scoped child identifier back to its campaign before returning or mutating data, then apply the same owner/administrator policy used by direct campaign routes. Copy operations must authorize both source and target contexts. Global governance mutations are administrator-only.

**Why:** Authentication alone did not prevent a user from accessing another campaign through indirect cost, planning-period, activity, or execution identifiers. Direct campaign checks therefore cannot be treated as sufficient protection for related route modules.

**How to apply:** For each new campaign child route, resolve its campaign first and enforce view or mutate access before business logic. Cover direct and indirect identifiers with production-mode HTTP tests using owner, unrelated-user, and administrator sessions.