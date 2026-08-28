---
name: Closed-period serialization
description: Concurrency rule for campaign finance mutations and planning-period close controls.
---

Any mutation that can change campaign financial state must acquire row locks on the campaign's planning periods and inspect closed status inside the same transaction as its write. Period close must serialize on those same rows.

**Why:** A status check performed before a write transaction permits close to commit between the check and write, allowing financial changes after the period is closed.

**How to apply:** When adding a financial mutation, lock the applicable campaign planning-period rows before testing status. Do not move the check outside the transaction or use a different lock target than close.