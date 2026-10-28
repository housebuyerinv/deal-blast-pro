-- Explicit privileges for the existing login and cloud workspace paths in a fresh project.
-- Do not grant browser roles any bm_* table privileges.
grant select on public.account_profiles,public.workspaces,public.workspace_plan_assignments,public.account_registration_events to authenticated;
grant update(full_name,display_name,business_name,company,onboarding_version_completed,onboarding_completed_at,onboarding_dismissed_at) on public.account_profiles to authenticated;
grant select,insert,update,delete on public.cloud_snapshots to authenticated;
grant all on all tables in schema public to service_role;
-- Preserve the buyer-account migration's append-only evidence boundary after
-- the legacy staging blanket grant. Row triggers alone cannot stop TRUNCATE.
revoke update,delete,truncate,references,trigger on public.bm_buyer_account_events,
 public.bm_buyer_proofs,public.bm_buyer_proof_reviews,public.bm_buyer_proof_uploads from service_role;
revoke delete,truncate,references,trigger on public.bm_buyer_accounts from service_role;
-- Existing notification defaults must never send to the production owner from staging.
update public.email_notification_settings set enabled=false,recipients='{}';
alter table public.email_notification_settings alter column enabled set default false;
alter table public.email_notification_settings alter column recipients set default '{}';
