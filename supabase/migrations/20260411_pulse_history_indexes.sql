create index if not exists idx_plex_audit_logs_action_created_at
on public.plex_audit_logs (action, created_at desc);

create index if not exists idx_plex_audit_logs_email_created_at
on public.plex_audit_logs (email, created_at desc);
