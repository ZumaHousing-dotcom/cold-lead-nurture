-- Run ONCE in the Supabase SQL editor (not a migration: it needs your project's secrets).
-- 1) Store the two secrets in Vault (replace the placeholders):
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('YOUR-WEBHOOK-SECRET', 'webhook_secret');

-- 2) Enable extensions (Dashboard > Database > Extensions also works):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Call the abandon-job Edge Function every 15 minutes.
select cron.schedule(
  'zuma-abandon-job',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/abandon-job',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Webhook-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'webhook_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check runs:  select * from cron.job_run_details order by start_time desc limit 10;
-- Remove:      select cron.unschedule('zuma-abandon-job');
