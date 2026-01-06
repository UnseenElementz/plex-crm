-- Global Chatroom Tables

create table if not exists public.global_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  user_name text not null,
  content text not null,
  is_deleted boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_global_chat_created on public.global_chat_messages(created_at desc);

create table if not exists public.global_chat_settings (
  key text primary key,
  value text not null
);

-- Default settings
insert into public.global_chat_settings (key, value) values ('is_open', 'true') on conflict do nothing;

create table if not exists public.global_chat_moderators (
  email text primary key,
  added_at timestamptz default now()
);

create table if not exists public.global_chat_bans (
  email text primary key,
  reason text,
  banned_at timestamptz default now()
);

-- RLS Policies
alter table public.global_chat_messages enable row level security;
alter table public.global_chat_settings enable row level security;
alter table public.global_chat_moderators enable row level security;
alter table public.global_chat_bans enable row level security;

-- Messages: Everyone can read
create policy "Public read messages" on public.global_chat_messages for select to anon, authenticated using (true);
create policy "Auth insert messages" on public.global_chat_messages for insert to authenticated with check (true);

-- Settings: Everyone read
create policy "Public read settings" on public.global_chat_settings for select to anon, authenticated using (true);

-- Mods: Everyone read
create policy "Public read mods" on public.global_chat_moderators for select to anon, authenticated using (true);

-- Enable Realtime
-- Attempt to add tables to publication safely
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

alter publication supabase_realtime add table public.global_chat_messages;
alter publication supabase_realtime add table public.global_chat_settings;
