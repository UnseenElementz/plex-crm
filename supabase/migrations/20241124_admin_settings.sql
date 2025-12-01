-- Create admin_settings table
create table if not exists admin_settings (
  id bigint primary key default 1,
  smtp_host text,
  smtp_port text default '587',
  smtp_user text,
  smtp_pass text,
  smtp_from text,
  paypal_email text,
  timezone text default 'Europe/London',
  monthly_maintenance numeric default 140,
  company_name text default 'Streamz R Us',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Grant permissions
grant all on admin_settings to authenticated;
grant select on admin_settings to anon;

-- Create RLS policies
alter table admin_settings enable row level security;

-- Only authenticated users can view settings
CREATE POLICY "Authenticated users can view settings" ON admin_settings
  FOR SELECT TO authenticated
  USING (true);

-- Only authenticated users can update settings
CREATE POLICY "Authenticated users can update settings" ON admin_settings
  FOR UPDATE TO authenticated
  USING (true);

-- Only authenticated users can insert settings
CREATE POLICY "Authenticated users can insert settings" ON admin_settings
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Insert default settings if not exists
insert into admin_settings (id, monthly_maintenance, company_name) 
values (1, 140, 'Streamz R Us') 
on conflict (id) do nothing;