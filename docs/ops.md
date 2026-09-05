# BrandMyItem operations

## Recovery and restore

PostgreSQL is authoritative for campaigns and reservations. Stripe is a
reconciliation source for SetupIntents, Customers, PaymentIntents, and refunds,
but Stripe records do not replace the application database.

Before any schema migration or data repair:

1. Record the UTC timestamp, operator, reason, and intended row scope.
2. Take a database snapshot or export of the affected tables. For a focused
   repair, export `campaigns`, `placement_orders`, `upload_intents`,
   `campaign_checkins`, and `audit_events`. Keep the export outside the
   application runtime path.
3. Run the repair in a transaction with explicit primary-key predicates.
4. Save the before and after counts, IDs, and state transitions.
5. Restart the API once, verify the public and admin reads, then restart it a
   second time and verify the same counts and states again.

The recovery that prompted this runbook was a lifecycle-state transition, not a
row deletion. A sweep run with a future clock moved both canonical campaigns to
`expired` and released one payment-failed placement. The safe repair was to
restore those rows in place, preserving their IDs, Stripe references, uploaded
objects, and email markers.

## Replit database recovery

For a development database, use the Replit checkpoint rollback flow when the
checkpoint contains the desired database state. Checkpoint rollback restores the
database together with the project state.

For a production database, use Replit point-in-time restore to select a moment
within the available backup retention window. Replit also provides scheduled
daily backups as restore points. Confirm the target environment before restoring
and document the selected timestamp. Do not use a production restore as a
substitute for a development data repair.

After a restore, compare campaign IDs, reservation IDs, lifecycle states, and
Stripe references before allowing the API to serve traffic. Run the API
verification suite and the two-restart verification described above.

## Guarded test-record cleanup

Automated records must set `test = true` on both the campaign and each
reservation. Public campaign, tracking, ticker, and email queries exclude
flagged records. The admin cleanup endpoint defaults to dry-run mode:

```text
POST /api/admin/cleanup-test-records
{}
```

Deletion requires an explicitly flagged row, an age greater than one hour, and
the default maximum of 20 rows. The operation logs every deleted primary key
and reason. If more than 20 rows qualify, it aborts without deleting anything
and returns a conflict response. Never broaden the predicate to names, emails,
campaign status, or Stripe state.