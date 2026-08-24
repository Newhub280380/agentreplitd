---
name: Stripe delivery test teardown
description: Keeping real Stripe test-mode webhook checks from leaving orphaned event records.
---

Real Stripe webhook delivery is asynchronous beyond the test process. Before deleting test workspaces, wait for the cancellation lifecycle event to be delivered and persisted, then remove the associated event records and workspace together.

**Why:** A subscription cancellation can arrive after the workspace has been deleted. The managed webhook's event ledger is intentionally independent of the workspace lifecycle, so the late event can otherwise survive as an orphaned payment-test record.

**How to apply:** Any test-mode flow that creates Stripe subscriptions must cancel them during cleanup, confirm delivery of the resulting lifecycle event, and only then remove the test workspace and its Stripe event records. Keep browser-assisted hosted Checkout checks in a runner that can keep the test process alive while the hosted page is completed.