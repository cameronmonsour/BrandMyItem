---
name: Resend delivery boundary
description: Durable constraints for transactional email delivery in BrandMyItem.
---

Transactional email must use direct HTTPS requests to Resend, reading only `RESEND_API_KEY` and `RESEND_FROM` from the environment. Every message includes `support@brandmyitem.com` as Reply-To, and delivery responses may expose only the provider message ID.

**Why:** The project removed the Replit Resend connector path so sender configuration and delivery behavior are explicit, testable, and consistent across reservation, tracking, and support email.

**How to apply:** Keep missing configuration fail-safe. Do not put keys or sender values in source code, logs, or chat. Frontend confirmation copy should say a copy was sent only after the send endpoint succeeds.