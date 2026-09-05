---
name: GitHub push authentication
description: Covers a Replit environment-specific GitHub push failure that can recur during launch work.
---

GitHub connector reads can succeed while the saved Git credential is invalid and connector write requests are blocked before reaching GitHub.

**Why:** Retrying through both the connector proxy and its SDK produced the same infrastructure-layer block, while anonymous Git reads proved the local branch was a safe fast-forward.

**How to apply:** Verify ancestry and file overlap without force-pushing. If authenticated writes still fail, ask the user to reauthorize GitHub in Replit's Git pane and push the existing local commits.