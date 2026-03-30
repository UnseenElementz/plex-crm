-- Add missing columns to admin_settings table
alter table public.admin_settings
  add column if not exists movies_only_price numeric default 60,
  add column if not exists tv_only_price numeric default 60,
  add column if not exists bg_music_url text,
  add column if not exists bg_music_volume numeric default 0.5,
  add column if not exists bg_music_enabled boolean default false,
  add column if not exists downloads_price numeric default 20;
