-- Run by scripts/test-sql.sh against a throwaway Postgres. Any failed assertion aborts with an error.
\set ON_ERROR_STOP on
create or replace function t_assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', msg; end if; end $$;

-- valid insert, default fields
select t_assert((select status from upsert_lead('a@b.co','Sam','Private','1',false,'netlify_form')) = 'started', 'insert started');

-- blank fields do not erase data; version bumps
select upsert_lead('a@b.co','','', '2', false, 'netlify_form');
select t_assert((select first_name = 'Sam' and room_interest = 'Private' and step = '2' and version = 2 from leads where email='a@b.co'), 'blank fields keep data');

-- completed lead is never downgraded; late started ping changes nothing (version unchanged)
select upsert_lead('a@b.co','','', '', true, 'netlify_form');
select t_assert((select status = 'completed' and version = 3 from leads where email='a@b.co'), 'completes');
select t_assert((select status from upsert_lead('a@b.co','Other','','9',false,'netlify_form')) = 'completed', 'not downgraded');
select t_assert((select version = 3 and first_name = 'Sam' from leads where email='a@b.co'), 'late ping is a no-op');

-- source is kept from first contact
select upsert_lead('c@d.co','','', '', false, 'appfolio');
select upsert_lead('c@d.co','','', '', false, 'netlify_form');
select t_assert((select source = 'appfolio' from leads where email='c@d.co'), 'source kept');

-- abandonment query
delete from leads;
select upsert_lead('old@x.co','','','1',false,'netlify_form');
select upsert_lead('recent@x.co','','','1',false,'netlify_form');
select upsert_lead('done@x.co','','','1',true,'netlify_form');
select upsert_lead('tagged@x.co','','','1',false,'netlify_form');
update leads set updated_at = now() - interval '90 minutes' where email in ('old@x.co','done@x.co','tagged@x.co');
update leads set updated_at = now() - interval '10 minutes' where email = 'recent@x.co';
update leads set abandoned_at = now() where email = 'tagged@x.co';
select t_assert((select array_agg(email) from abandoned_candidates(60)) = array['old@x.co'], 'only old started untagged lead is a candidate');

-- unsynced tracking
select t_assert((select count(*) from unsynced_leads()) = 4, 'all unsynced');
update leads set synced_version = version where email = 'old@x.co';
select t_assert((select count(*) from unsynced_leads()) = 3, 'one synced');

select 'SQL tests passed' as result;
