---
name: Stripe Sync migration assets
description: Packaging constraint for Stripe Sync migrations in the API server.
---

`stripe-replit-sync` must be an external dependency in the API build rather than being bundled.

**Why:** Its migration runner resolves a `migrations` directory relative to the installed package. Bundling moves that lookup beside the API output and leaves the Stripe schema empty even though the migration call succeeds.

**How to apply:** Preserve the externalization whenever editing the API esbuild configuration, and verify startup logs confirm Stripe schema, managed webhook, and backfill readiness after dependency or build changes.