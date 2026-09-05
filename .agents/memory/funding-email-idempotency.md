---
name: Funding email idempotency
description: Funding charges and transactional email delivery must remain separate durable outcomes.
---

Funding transitions must commit independently from notification delivery. Successful charges remain funded when Resend rejects a recipient, and retryable email delivery records its own timestamp and provider message ID so reconciliation can retry without duplicating successful sends.

**Why:** Stripe payment state is authoritative for money movement, while email providers can fail for recipient-specific or transient reasons. Coupling the two would make a committed charge look unfinished or send duplicates during the next lifecycle sweep.

**How to apply:** Add durable sent-at/message-ID fields for each funding notification type, condition updates on the sent-at field, and let the next reconciliation cycle retry only rows without a recorded delivery.