-- Enable UUID generation
create extension if not exists pgcrypto;

-- Profiles table: one row per authenticated user
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'customer' check (role in ('admin','customer')),
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles RLS: users can read/write their own row
create policy profiles_self_select
  on public.profiles for select
  to authenticated using (user_id = auth.uid());

create policy profiles_self_insert
  on public.profiles for insert
  to authenticated with check (user_id = auth.uid());

create policy profiles_self_update
  on public.profiles for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Customers table
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  subscription_type text not null default 'monthly' check (subscription_type in ('monthly','yearly')),
  streams int not null default 1,
  start_date date,
  next_payment_date date,
  notes text,
  subscription_status text not null default 'active' check (subscription_status in ('active','inactive')),
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

-- Customers RLS: customers can read their own record by email
create policy customers_self_select
  on public.customers for select
  to authenticated using (email = auth.email());

-- Admin policy: admins can full access
create policy customers_admin_all
  on public.customers for all
  to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- Payments table
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric(10,2) not null,
  payment_date timestamptz not null default now(),
  status text not null default 'completed' check (status in ('completed','pending','failed')),
  payment_method text not null default 'PayPal'
);

alter table public.payments enable row level security;

-- Payments RLS: customers can read their own payments; admins full access
create policy payments_self_select
  on public.payments for select
  to authenticated using (
    exists (
      select 1 from public.customers c where c.id = payments.customer_id and c.email = auth.email()
    )
  );

create policy payments_admin_all
  on public.payments for all
  to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- Admin settings table (admin-only)
create table if not exists public.admin_settings (
  id int primary key default 1,
  smtp_host text,
  smtp_port text,
  smtp_user text,
  smtp_pass text,
  smtp_from text,
  paypal_email text,
  timezone text default 'Europe/London',
  monthly_maintenance numeric(10,2) default 140,
  company_name text default 'Streamz R Us',
  monthly_price numeric(10,2) default 15,
  yearly_price numeric(10,2) default 85,
  stream_monthly_price numeric(10,2) default 5,
  stream_yearly_price numeric(10,2) default 20,
  updated_at timestamptz default now()
);

alter table public.admin_settings enable row level security;

create policy admin_settings_admin_all
  on public.admin_settings for all
  to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- Helpful index
create index if not exists idx_customers_email on public.customers(email);
create index if not exists idx_payments_customer on public.payments(customer_id);

-- Seed: Ensure a single settings row exists (admins can update it later)
insert into public.admin_settings (id) values (1)
on conflict (id) do nothing;

-- Ensure pricing columns exist if migrating an older database
alter table public.admin_settings add column if not exists monthly_price numeric(10,2) default 15;
alter table public.admin_settings add column if not exists yearly_price numeric(10,2) default 85;
alter table public.admin_settings add column if not exists stream_monthly_price numeric(10,2) default 5;
alter table public.admin_settings add column if not exists stream_yearly_price numeric(10,2) default 20;
-- Live chat tables
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  sender text not null check (sender in ('customer','admin')),
  text text not null,
  attachment_url text,
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);

alter table public.messages enable row level security;

create index if not exists idx_messages_chat on public.messages(chat_id);
create index if not exists idx_messages_created on public.messages(created_at);

create policy messages_authenticated_all
  on public.messages for all
  to authenticated using (true) with check (true);

create policy messages_anon_select_insert
  on public.messages for select to anon using (true);
create policy messages_anon_insert
  on public.messages for insert to anon with check (true);

-- Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  status text default 'active' check (status in ('active','closed','waiting')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz,
  customer_ip inet,
  metadata jsonb default '{}'::jsonb
);

alter table public.conversations enable row level security;
create index if not exists idx_conversations_status on public.conversations(status);
create index if not exists idx_conversations_created on public.conversations(created_at desc);

create policy conversations_authenticated_all
  on public.conversations for all to authenticated using (true) with check (true);
create policy conversations_anon_basic
  on public.conversations for select to anon using (true);
create policy conversations_anon_insert
  on public.conversations for insert to anon with check (true);

-- Participants table
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid not null,
  user_type text not null check (user_type in ('customer','admin')),
  joined_at timestamptz default now(),
  last_seen timestamptz default now()
);

alter table public.participants enable row level security;
create index if not exists idx_participants_conversation on public.participants(conversation_id);
create index if not exists idx_participants_user on public.participants(user_id, user_type);
create policy participants_authenticated_all
  on public.participants for all to authenticated using (true) with check (true);
create policy participants_anon_select_insert
  on public.participants for select to anon using (true);
create policy participants_anon_insert
  on public.participants for insert to anon with check (true);

-- Attachments table
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  file_url text not null,
  file_type text not null,
  file_size integer not null,
  file_name text not null,
  uploaded_at timestamptz default now()
);

alter table public.attachments enable row level security;
create index if not exists idx_attachments_message on public.attachments(message_id);
create policy attachments_authenticated_all
  on public.attachments for all to authenticated using (true) with check (true);
