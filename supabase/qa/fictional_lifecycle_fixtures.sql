-- Fictional QA-only lifecycle fixtures. Never run against production.
-- The reserved .invalid addresses cannot receive email.

insert into public.account_profiles
  (user_id,email,full_name,company,role,product_updates_opt_in,dismissed_promotion_key,dismissed_promotion_at)
values
  ('00000000-0000-4000-8000-000000000001','free@qa.dealblast.invalid','Free QA','DBP QA','Admin',false,null,null),
  ('00000000-0000-4000-8000-000000000002','starter@qa.dealblast.invalid','Starter Paid QA','DBP QA','Admin',true,null,null),
  ('00000000-0000-4000-8000-000000000003','trial@qa.dealblast.invalid','Pro Trial QA','DBP QA','Admin',true,'pro-trial-launch20-v1',now()),
  ('00000000-0000-4000-8000-000000000004','pro@qa.dealblast.invalid','Pro Paid QA','DBP QA','Admin',true,null,null),
  ('00000000-0000-4000-8000-000000000005','agency@qa.dealblast.invalid','Agency Paid QA','DBP QA','Admin',true,null,null),
  ('00000000-0000-4000-8000-000000000006','owner-admin@qa.dealblast.invalid','Owner Admin QA','DBP QA','Owner Admin',false,null,null)
on conflict (user_id) do update set
  email=excluded.email, full_name=excluded.full_name, company=excluded.company,
  role=excluded.role, product_updates_opt_in=excluded.product_updates_opt_in,
  dismissed_promotion_key=excluded.dismissed_promotion_key,
  dismissed_promotion_at=excluded.dismissed_promotion_at, updated_at=now();

insert into public.workspaces (id,owner_user_id,owner_email,name)
values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','free@qa.dealblast.invalid','Free QA Workspace'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','starter@qa.dealblast.invalid','Starter Paid QA Workspace'),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','trial@qa.dealblast.invalid','Pro Trial QA Workspace'),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','pro@qa.dealblast.invalid','Pro Paid QA Workspace'),
  ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','agency@qa.dealblast.invalid','Agency Paid QA Workspace'),
  ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','owner-admin@qa.dealblast.invalid','Owner Admin QA Workspace')
on conflict (id) do update set owner_email=excluded.owner_email,name=excluded.name,updated_at=now();

insert into public.workspace_plan_assignments
  (workspace_id,user_id,plan_name,current_plan,effective_access_plan,billing_status,trial_status,
   payment_status,subscription_status,billing_interval,property_intelligence_included_credits,
   trial_started_at,trial_ends_at,trial_converted_at,trial_consumed_at,first_paid_at,promotion_code,source)
values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Free','Free','Free','Free Active','Not Trial','No payment required',null,null,0,null,null,null,null,null,null,'QA Fixture'),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Starter','Starter','Starter','Paid Active','Not Trial','Paid','active','monthly',20,null,null,null,null,now(),null,'QA Fixture'),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','Pro','Pro','Pro','Trial Active','Trial Active','No payment required','trialing','monthly',0,now()-interval '1 day',now()+interval '13 days',null,now()-interval '1 day',null,'LAUNCH20','QA Fixture'),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','Pro','Pro','Pro','Paid Active','Converted','Paid','active','monthly',50,now()-interval '30 days',now()-interval '16 days',now()-interval '16 days',now()-interval '30 days',now()-interval '16 days','LAUNCH20','QA Fixture'),
  ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','Agency','Agency','Agency','Paid Active','Not Trial','Paid','active','monthly',150,null,null,null,null,now(),null,'QA Fixture'),
  ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','Owner Admin','Owner Admin','Owner Admin','Internal Active','Not Trial','Internal',null,null,0,null,null,null,null,null,null,'QA Fixture')
on conflict (workspace_id) do update set
  plan_name=excluded.plan_name,current_plan=excluded.current_plan,effective_access_plan=excluded.effective_access_plan,
  billing_status=excluded.billing_status,trial_status=excluded.trial_status,payment_status=excluded.payment_status,
  subscription_status=excluded.subscription_status,billing_interval=excluded.billing_interval,
  property_intelligence_included_credits=excluded.property_intelligence_included_credits,
  trial_started_at=excluded.trial_started_at,trial_ends_at=excluded.trial_ends_at,
  trial_converted_at=excluded.trial_converted_at,trial_consumed_at=excluded.trial_consumed_at,
  first_paid_at=excluded.first_paid_at,promotion_code=excluded.promotion_code,source=excluded.source,updated_at=now();
