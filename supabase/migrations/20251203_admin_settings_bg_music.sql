-- Add background music fields to admin_settings
alter table public.admin_settings
  add column if not exists bg_music_url text,
  add column if not exists bg_music_volume numeric(4,3) default 0.1,
  add column if not exists bg_music_enabled boolean default true;

