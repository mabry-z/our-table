-- Lets the database call the globus-flyer function itself, so the job secret never leaves
-- the database. Used for manual test runs now and by the weekly pg_cron schedule later.

create extension if not exists pg_net with schema extensions;

create function private.call_flyer_job(p_body jsonb)
returns bigint  -- pg_net request id; the response lands in net._http_response
language sql security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://wxcwrainvcgmfdsgexsu.supabase.co/functions/v1/globus-flyer',
    body := p_body,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-job-secret', (select secret from private.job_secrets where name = 'flyer_jobs')
    ),
    timeout_milliseconds := 140000
  )
$$;
revoke execute on function private.call_flyer_job(jsonb) from public, anon, authenticated;
