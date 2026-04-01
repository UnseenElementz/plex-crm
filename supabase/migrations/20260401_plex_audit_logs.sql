create table if not exists public.plex_audit_logs (
  id text primary key,
  created_at timestamptz not null default now(),
  action text not null,
  email text,
  server_machine_id text,
  share_id text,
  details jsonb
);
