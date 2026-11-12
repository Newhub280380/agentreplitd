---
name: Mockup graduation production shell
description: A design mockup can look correct in isolation while the live page still wraps it in a legacy shell.
---

When graduating a visual mockup, verify the route's real parent layout and responsive behavior, not just the isolated iframe preview.

**Why:** An isolated post-login mockup initially appeared correct, but the authenticated route still rendered inside the old sidebar/header wrapper, which defeated the intended redesign and broke the mobile layout.

**How to apply:** Trace the route from auth gate through its layout wrappers. If the redesign owns navigation or viewport chrome, bypass or replace the legacy wrapper for that route, then test both authenticated and unauthenticated entry points.