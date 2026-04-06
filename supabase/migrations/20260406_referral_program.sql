alter table public.customers
  add column if not exists referral_code text,
  add column if not exists referred_by_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists referral_credit_balance numeric(10,2) not null default 0,
  add column if not exists referral_credit_earned_total numeric(10,2) not null default 0,
  add column if not exists referral_credit_redeemed_total numeric(10,2) not null default 0,
  add column if not exists successful_referrals_count integer not null default 0;

create unique index if not exists idx_customers_referral_code on public.customers(referral_code) where referral_code is not null;
create index if not exists idx_customers_referred_by_customer_id on public.customers(referred_by_customer_id);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referrer_customer_id uuid not null references public.customers(id) on delete cascade,
  referred_customer_id uuid not null references public.customers(id) on delete cascade,
  referral_code text not null,
  reward_amount numeric(10,2) not null default 0,
  status text not null default 'rewarded' check (status in ('rewarded', 'capped')),
  created_at timestamptz not null default now(),
  unique (referred_customer_id)
);

alter table public.referral_events enable row level security;

create policy referral_events_admin_all
  on public.referral_events for all
  to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

create policy referral_events_customer_select
  on public.referral_events for select
  to authenticated using (
    exists (
      select 1
      from public.customers c
      where (c.id = referral_events.referrer_customer_id or c.id = referral_events.referred_customer_id)
        and c.email = auth.email()
    )
  );
