---
name: OpenAPI assent requirements
description: Durable API schema and generated-client constraints for consent metadata.
---

Assent metadata is part of the required request contract, not an optional annotation. Keep owner assent required on campaign registration and brand assent required on checkout input before regenerating the API artifacts.

**Why:** Making these fields optional in generated types allowed client/server contracts to drift. The generated React client also uses a Headers API shape that is not exposed by this workspace TypeScript configuration.

**How to apply:** Update the OpenAPI required arrays first, run codegen, then preserve the generated header conversion using Headers.forEach rather than Headers.entries.