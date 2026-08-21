# Empty-database bootstrap

The earliest Deal Blast Pro tables were originally created in the Supabase SQL
Editor before migration files were checked in. A new QA/staging project must be
initialized in this order:

1. Run `0001_legacy_foundation.sql` once on the empty project.
2. Run every file in `supabase/migrations` in filename order.
3. Record the applied bootstrap and migration filenames in the environment's
   migration audit before inserting fictional QA fixtures.

The bootstrap is schema-only. It must never contain exported production rows,
auth users, customer contact details, Stripe identifiers, credit balances,
ledger records, email logs, storage objects, or secrets.

`deal_submissions`, `buyer_portal_submissions`, and
`deal_portal_submissions` are included because they predate the repository's
migration history. All later structures continue to be owned by the existing
migration chain.
