---
name: Scoped workspace themes
description: Apply a new visual system to part of an app without leaking styles or leaving semantic components on the old palette.
---

When restyling a subset of routes, scope the complete semantic token palette to the new shell and explicitly cover legacy hard-coded utility surfaces.

**Why:** Changing only the shell background left component cards on the old light `card` token, while direct white and translucent zinc utility classes bypassed semantic tokens altogether.

**How to apply:** Define semantic color variables beneath the route shell, add narrowly scoped compatibility overrides for existing hard-coded surfaces, and test the real authenticated routes at desktop and mobile sizes before declaring the migration complete.