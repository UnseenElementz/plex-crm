-- Add missing columns to admin_settings table
alter table public.admin_settings
  add column if not exists monthly_price numeric default 15,
  add column if not exists yearly_price numeric default 85,
  add column if not exists stream_monthly_price numeric default 5,
  add column if not exists stream_yearly_price numeric default 20,
  add column if not exists three_year_price numeric default 200,
  add column if not exists stream_three_year_price numeric default 40,
  add column if not exists payment_lock boolean default false,
  add column if not exists chat_online boolean default true,
  add column if not exists hero_image_url text,
  add column if not exists admin_user text,
  add column if not exists admin_pass text,
  add column if not exists plex_token text,
  add column if not exists plex_server_url text default 'https://plex.tv';
