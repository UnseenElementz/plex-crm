-- Seed admin settings values after table creation
update public.admin_settings
set 
  company_name = coalesce(company_name, 'Streamz R Us'),
  monthly_price = coalesce(monthly_price, 15),
  yearly_price = coalesce(yearly_price, 85),
  stream_monthly_price = coalesce(stream_monthly_price, 5),
  stream_yearly_price = coalesce(stream_yearly_price, 20),
  two_year_price = coalesce(two_year_price, 150),
  stream_two_year_price = coalesce(stream_two_year_price, 35),
  three_year_price = coalesce(three_year_price, 180),
  stream_three_year_price = coalesce(stream_three_year_price, 40),
  timezone = coalesce(timezone, 'Europe/London'),
  updated_at = now()
where id = 1;
