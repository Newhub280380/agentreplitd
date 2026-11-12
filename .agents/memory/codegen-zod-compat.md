---
name: OpenAPI codegen and Zod compatibility
description: A version-specific constraint when extending this workspace's OpenAPI contract.
---

When extending the API contract, prefer OpenAPI `number` for integer-like counters and avoid `format: uri` unless the generated Zod version is known to support the emitted helpers.

**Why:** The workspace currently generates against Zod 3 while Orval can emit Zod 4-only top-level helpers such as `z.int()` and `z.url()` for those OpenAPI shapes, which breaks the library typecheck after an otherwise successful codegen run.

**How to apply:** After codegen, run the full library typecheck immediately; if generated helpers are unsupported, adjust the OpenAPI shape rather than editing generated files.