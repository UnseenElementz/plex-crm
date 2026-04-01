alter table public.admin_settings
  add column if not exists chat_availability text default 'active' check (chat_availability in ('off','waiting','active')),
  add column if not exists chat_idle_timeout_minutes integer default 5;

update public.admin_settings
set chat_availability = case
  when coalesce(chat_online, true) = false then 'off'
  else coalesce(chat_availability, 'active')
end
where id = 1;
