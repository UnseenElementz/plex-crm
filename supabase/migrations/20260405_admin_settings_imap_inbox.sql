alter table public.admin_settings add column if not exists imap_host text;
alter table public.admin_settings add column if not exists imap_port text default '993';
alter table public.admin_settings add column if not exists imap_user text;
alter table public.admin_settings add column if not exists imap_pass text;
alter table public.admin_settings add column if not exists imap_secure boolean default true;
alter table public.admin_settings add column if not exists imap_mailbox text default 'INBOX';
alter table public.admin_settings add column if not exists service_email_keywords text default 'plex,stream,service,payment,renewal,buffer,login,support,subscription';
