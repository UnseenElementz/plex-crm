-- Ensure company_name column exists in admin_settings table
alter table public.admin_settings
  add column if not exists company_name text default 'Streamz R Us';