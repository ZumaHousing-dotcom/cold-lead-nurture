-- Leads who started (and maybe finished) the Zuma inquiry form.
create table if not exists public.leads (
    email          text primary key,
    first_name     text,
    room_interest  text,
    step           text,
    source         text not null default 'netlify_form',
    status         text not null default 'started' check (status in ('started', 'completed')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    completed_at   timestamptz,
    abandoned_at   timestamptz,            -- set once the form-abandoned tag is applied
    nudge_line     text,
    version        integer not null default 1,   -- bumped on every change
    synced_version integer not null default 0    -- last version pushed to Mailchimp
);

create index if not exists leads_abandon_idx on public.leads (status, abandoned_at, updated_at);

-- Only the service role (Edge Functions) touches this table. RLS on + no policies = no public access.
alter table public.leads enable row level security;

-- Insert or update a lead. A completed lead is never moved back to 'started', and a late
-- "started" ping for a completed lead changes nothing.
create or replace function public.upsert_lead(
    p_email text, p_first_name text, p_room_interest text, p_step text,
    p_completed boolean, p_source text
) returns public.leads
language plpgsql security definer set search_path = public as $$
declare
    r public.leads;
begin
    insert into public.leads as l (email, first_name, room_interest, step, source, status, completed_at)
    values (p_email, nullif(p_first_name, ''), nullif(p_room_interest, ''), nullif(p_step, ''),
            p_source, case when p_completed then 'completed' else 'started' end,
            case when p_completed then now() end)
    on conflict (email) do update set
        first_name    = coalesce(nullif(p_first_name, ''), l.first_name),
        room_interest = coalesce(nullif(p_room_interest, ''), l.room_interest),
        step          = coalesce(nullif(p_step, ''), l.step),
        status        = case when p_completed then 'completed' else l.status end,
        completed_at  = case when p_completed and l.completed_at is null then now() else l.completed_at end,
        updated_at    = now(),
        version       = l.version + 1
    where p_completed or l.status <> 'completed'
    returning l.* into r;

    if r.email is null then
        select * into r from public.leads where email = p_email;
    end if;
    return r;
end $$;

-- Leads whose last change has not reached Mailchimp yet (retried by the scheduled job).
create or replace function public.unsynced_leads(p_limit integer default 100)
returns setof public.leads language sql security definer set search_path = public as $$
    select * from public.leads where synced_version < version order by updated_at limit p_limit
$$;

-- Started, not yet tagged abandoned, idle for more than p_after_min minutes.
create or replace function public.abandoned_candidates(p_after_min integer, p_limit integer default 100)
returns setof public.leads language sql security definer set search_path = public as $$
    select * from public.leads
    where status = 'started' and abandoned_at is null
      and updated_at < now() - make_interval(mins => p_after_min)
    order by updated_at limit p_limit
$$;

revoke all on function public.upsert_lead(text, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.unsynced_leads(integer) from public, anon, authenticated;
revoke all on function public.abandoned_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.upsert_lead(text, text, text, text, boolean, text) to service_role;
grant execute on function public.unsynced_leads(integer) to service_role;
grant execute on function public.abandoned_candidates(integer, integer) to service_role;
grant select, insert, update on public.leads to service_role;
