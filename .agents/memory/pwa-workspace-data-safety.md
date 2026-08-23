---
name: PWA workspace data safety
description: Service-worker constraints for an authenticated multi-workspace application.
---

The PWA service worker must not cache or intercept Clerk, API, or user-specific workspace responses.

**Why:** A cached authenticated response can become stale after an account switch and risks showing one workspace's state in another session.

**How to apply:** Keep the worker limited to lifecycle behavior unless a future offline design includes a reviewed, user-independent static-asset cache. Preserve base-path-relative manifest and worker registration so installation works under artifact subpaths.