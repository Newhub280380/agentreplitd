---
name: Post-merge Drizzle safety
description: Keep automatic development schema synchronization non-destructive when the app has a runtime-created migration ledger.
---

Exclude runtime-only migration ledger tables from Drizzle's post-merge table filter instead of force-pushing a destructive schema diff.

**Why:** The billing migration ledger is deliberately created outside the Drizzle schema. Without an exclusion, Drizzle treats it as unwanted database state and prompts to delete it, which cannot run safely in non-interactive post-merge setup.

**How to apply:** Keep the normal non-interactive dev schema push and a realistic timeout. Add a narrow negated table filter for any intentionally unmanaged ledger; never replace the prompt with a blanket force flag.