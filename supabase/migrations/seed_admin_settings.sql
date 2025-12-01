-- Seed admin settings values after table creation
update public.admin_settings
set 
  company_name = coalesce(company_name, 'Streamz R Us'),
  monthly_price = coalesce(monthly_price, 15),
  yearly_price = coalesce(yearly_price, 85),
  stream_monthly_price = coalesce(stream_monthly_price, 5),
  stream_yearly_price = coalesce(stream_yearly_price, 20),
  timezone = coalesce(timezone, 'Europe/London'),
  updated_at = now()
where id = 1;
