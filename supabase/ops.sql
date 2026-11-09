-- Day-to-day queries for the Cold Lead Nurture system. Paste into the Supabase SQL editor.
-- Read-only unless marked WRITE. This table contains personal data (emails): share results carefully.

-- 1) Funnel: how many leads are in each state, by source
select source, status, count(*) as leads,
       count(*) filter (where abandoned_at is not null) as tagged_abandoned
from public.leads group by source, status order by source, status;

-- 2) Last 7 days: started vs completed per day
select date_trunc('day', created_at)::date as day,
       count(*) as new_leads,
       count(*) filter (where status = 'completed') as completed
from public.leads where created_at > now() - interval '7 days' group by 1 order by 1 desc;

-- 3) Waiting for the next abandon-job run (started, untagged, idle 60+ min)
select email, step, updated_at from public.abandoned_candidates(60);

-- 4) HEALTH: started leads idle for 3+ hours that were never tagged = the cron job is NOT running
select count(*) as stuck_leads
from public.leads
where status = 'started' and abandoned_at is null and updated_at < now() - interval '3 hours';

-- 5) HEALTH: leads that failed to reach Mailchimp (the job retries these every 15 minutes)
select email, version, synced_version, updated_at from public.unsynced_leads();

-- 6) Most recent 20 leads
select email, first_name, room_interest, step, source, status, created_at, updated_at, abandoned_at
from public.leads order by updated_at desc limit 20;

-- 7) Cron job status (needs pg_cron; shows the last 10 runs)
-- select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- select jobname, schedule, active from cron.job;

-- 8) WRITE: delete one person's data on request (also remove them in Mailchimp: Audience > the contact > Archive/Delete)
-- delete from public.leads where email = 'person@example.com';

-- 9) WRITE: remove a test lead after the end-to-end test
-- delete from public.leads where email = 'you+zumatest@yourdomain.com';
