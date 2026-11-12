---
name: Atomic quota counters
description: Safe concurrent consumption of per-workspace monthly limits in PostgreSQL.
---

Use a single PostgreSQL `INSERT … ON CONFLICT … DO UPDATE … WHERE … RETURNING` against the monthly workspace usage row when accepting a limited resource. Qualify the existing-row counter with the target-table alias inside the conflict update.

**Why:** A read-then-insert quota check allows concurrent requests to pass the same limit. In PostgreSQL conflict updates, an unqualified counter reference is ambiguous between the target row and the proposed row, which turns valid bursts into server errors.

**How to apply:** Keep the per-workspace/per-period primary key and atomically increment only when the stored counter is below the plan limit. Treat an empty `RETURNING` result as quota exhausted (`429`), and derive displayed usage from this counter rather than recounting resource records.