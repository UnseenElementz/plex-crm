-- Add status and kind columns to recommendations if they don't exist
alter table public.recommendations add column if not exists status text not null default 'pending' check (status in ('pending', 'done'));
alter table public.recommendations add column if not exists kind text not null default 'request' check (kind in ('request', 'issue'));

-- Update existing rows based on title prefix if possible
update public.recommendations set kind = 'issue' where title like 'ISSUE:%' and kind = 'request';
update public.recommendations set kind = 'request' where title like 'REQUEST:%' and kind = 'request';
