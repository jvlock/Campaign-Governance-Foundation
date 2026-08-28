---
name: Public taxonomy access
description: Records the intentional anonymous-access posture for taxonomy administration.
---

Taxonomy administration must remain publicly accessible for both reads and mutations. Do not reintroduce an authentication or role gate without a new explicit user decision. Preserve append-only auditing by attributing anonymous changes to a shared public actor.

**Why:** The user explicitly requested removal of the taxonomy gate and selected fully public access, including edits, rather than public read-only access.

**How to apply:** New taxonomy routes and UI controls should be available without login. Same-origin browser mutation checks and data-integrity validation may remain because they do not assign user privileges.