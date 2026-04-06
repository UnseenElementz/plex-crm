create table if not exists public.service_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.service_updates enable row level security;

create policy service_updates_read_all
  on public.service_updates for select
  to anon, authenticated
  using (true);

create policy service_updates_admin_all
  on public.service_updates for all
  to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

create index if not exists idx_service_updates_created_at on public.service_updates(created_at desc);
