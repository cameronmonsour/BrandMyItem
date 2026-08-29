---
name: BrandMyItem build environment
description: Environment variables required by the BrandMyItem Vite configuration during production builds.
---

BrandMyItem production builds require both `PORT` and `BASE_PATH` to be present in the environment.

**Why:** The Vite configuration validates these values before loading, so a build can fail before compilation even when typechecking passes.

**How to apply:** Set the workflow's configured values, or provide both variables when running the package build manually.