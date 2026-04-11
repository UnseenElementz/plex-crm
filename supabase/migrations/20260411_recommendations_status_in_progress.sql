alter table public.recommendations
  drop constraint if exists recommendations_status_check;

alter table public.recommendations
  add constraint recommendations_status_check
  check (status in ('pending', 'in-progress', 'done'));
