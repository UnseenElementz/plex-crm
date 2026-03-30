-- Add downloads_price column to admin_settings table
alter table public.admin_settings
  add column if not exists downloads_price numeric default 20;
