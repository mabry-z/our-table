-- Secrets that let our own scheduled jobs (pg_cron) and manual test runs call server functions
-- that cost money, such as reading a flyer with Claude. Stored in a schema the API doesn't
-- expose; only the service role can check a secret, and nobody can read one from the app.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.job_secrets (
  name       text primary key,
  secret     text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
revoke all on private.job_secrets from public, anon, authenticated;

insert into private.job_secrets (name) values ('flyer_jobs');

create function public.check_job_secret(p_name text, p_secret text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from private.job_secrets where name = p_name and secret = p_secret)
$$;
revoke execute on function public.check_job_secret(text, text) from public, anon, authenticated;
grant execute on function public.check_job_secret(text, text) to service_role;
