begin;
create publication if not exists supabase_realtime;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.attachments;
commit;
