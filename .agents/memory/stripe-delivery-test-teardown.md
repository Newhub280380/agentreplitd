---
name: Stripe delivery test teardown
description: Keeping real Stripe test-mode webhook checks from leaving orphaned event records.
---

Real Stripe webhook delivery is asynchronous beyond the test process. Before recording a billing event, lock and verify that its workspace still exists. Before deleting test workspaces, wait for the cancellation lifecycle event to be delivered and persisted, then remove the associated event records and workspace together.

**Why:** A subscription cancellation can arrive after the workspace has been deleted. The event ledger has no database foreign key to the workspace, so an insert-first handler can leave an orphaned payment-test record even after otherwise successful cleanup.

**How to apply:** Any billing webhook state update must return without recording an event if its workspace no longer exists. Any test-mode flow that creates Stripe subscriptions must cancel them during cleanup, confirm delivery of the resulting lifecycle event, then remove event records and the workspace; assert no rows remain. Keep browser-assisted hosted Checkout checks in a runner that can keep the test process alive while the hosted page is completed.