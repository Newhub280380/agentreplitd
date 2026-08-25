---
name: Medical content governance
description: Non-negotiable safety boundary for Zishel Medical AI Hub dossiers, drafts, review, and delivery.
---

Medical safety warnings are informational only when an operator can override them; treat prohibited clinical language and unresolved evidence warnings as hard server-side gates. A draft may be approved only after a named reviewer explicitly attests to the evidence review, and only when its claims warnings are resolved.

**Why:** The product is for licensed medical professionals, but it must not produce or distribute diagnoses, prescriptions, dosing or injection instructions, patient-specific procedures, or guaranteed clinical results. A polished UI confirmation cannot substitute for API enforcement.

**How to apply:** Keep the policy check on both dossier input and content creation, preserve workspace scoping before revealing validation feedback, and add a regression when policy classes or review states change. New delivery integrations must remain unavailable in the UI until their backend verification and delivery paths exist.