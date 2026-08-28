---
name: Pnpm transitive security patches
description: How to handle patched transitive packages that pnpm keeps at vulnerable lockfile resolutions.
---

When a vulnerable package is only transitive and package-specific updates preserve its old resolution, use a narrow workspace override for the patched version and regenerate the lockfile.

**Why:** This avoids broad parent upgrades while ensuring the lockfile cannot retain a known-vulnerable transitive release.

**How to apply:** Confirm the patched version satisfies every parent range, add the smallest exact override, regenerate the lockfile, and require both a clean audit and successful builds.