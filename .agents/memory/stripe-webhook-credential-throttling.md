---
name: Stripe webhook credential throttling
description: Handling transient Replit connector rate limits during a burst of Stripe webhook events.
---

Stripe credential reads must remain on-demand because connection credentials can rotate, but transient `429` responses from the connector should be retried with bounded backoff before rejecting a webhook.

**Why:** A normal subscription lifecycle emits several events together. If credential lookup fails once and the webhook endpoint returns an error, billing state depends on Stripe's later redelivery even though the event itself is valid.

**How to apply:** Keep Stripe clients uncached. When changing the connection helper or webhook path, retain short, bounded retry handling for rate-limit responses and validate a multi-event test-mode subscription flow.