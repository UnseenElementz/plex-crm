-- Advanced Request & Report Enhancements Migration
-- 1. Update recommendations table with status, kind, and updated_at
alter table public.recommendations add column if not exists status text not null default 'pending' check (status in ('pending', 'in-progress', 'done'));
alter table public.recommendations add column if not exists kind text not null default 'request' check (kind in ('request', 'issue'));
alter table public.recommendations add column if not exists updated_at timestamptz not null default now();
alter table public.recommendations add column if not exists anonymized boolean not null default false;

-- 2. Create function to anonymize email
create or replace function anonymize_email(email text) returns text as $$
begin
  return substring(email from 1 for 2) || '***@' || split_part(email, '@', 2);
end;
$$ language plpgsql;

-- 3. Update RLS policies for recommendations
-- Admins can do everything
drop policy if exists recommendations_admin_all on public.recommendations;
create policy recommendations_admin_all
  on public.recommendations for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- Customers can see all requests (anonymized in the UI/API layer or via view)
drop policy if exists recommendations_customer_select on public.recommendations;
create policy recommendations_customer_select
  on public.recommendations for select
  to authenticated
  using (true);

-- Customers can insert their own requests
drop policy if exists recommendations_customer_insert on public.recommendations;
create policy recommendations_customer_insert
  on public.recommendations for insert
  to authenticated
  with check (submitter_email = auth.email());

-- 4. Helpful indexes for filtering and sorting
create index if not exists idx_recommendations_status on public.recommendations(status);
create index if not exists idx_recommendations_kind on public.recommendations(kind);
create index if not exists idx_recommendations_updated on public.recommendations(updated_at desc);
create index if not exists idx_recommendations_submitter on public.recommendations(submitter_email);
