alter table public.workspace_plan_assignments
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists outstanding_balance integer not null default 0,
  add column if not exists latest_invoice_status text,
  add column if not exists latest_invoice_id text,
  add column if not exists latest_invoice_hosted_url text,
  add column if not exists latest_invoice_pdf text,
  add column if not exists billing_portal_last_opened_at timestamptz;

create index if not exists workspace_plan_assignments_stripe_customer_id_idx
  on public.workspace_plan_assignments (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists workspace_plan_assignments_stripe_subscription_id_idx
  on public.workspace_plan_assignments (stripe_subscription_id)
  where stripe_subscription_id is not null;
