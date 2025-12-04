-- Recommendations feature tables
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null,
  description text,
  image text,
  submitter_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_recommendations_created on public.recommendations(created_at desc);

create table if not exists public.recommendation_comments (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  author_email text,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rec_comments_rec on public.recommendation_comments(recommendation_id);
create index if not exists idx_rec_comments_created on public.recommendation_comments(created_at);

create table if not exists public.recommendation_likes (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  user_email text,
  created_at timestamptz not null default now(),
  constraint uniq_rec_like unique (recommendation_id, user_email)
);

create index if not exists idx_rec_likes_rec on public.recommendation_likes(recommendation_id);

-- Enable RLS and basic read policies
alter table public.recommendations enable row level security;
alter table public.recommendation_comments enable row level security;
alter table public.recommendation_likes enable row level security;

drop policy if exists rec_select_anon on public.recommendations;
create policy rec_select_anon
  on public.recommendations for select
  to anon using (true);

drop policy if exists rec_comments_select_anon on public.recommendation_comments;
create policy rec_comments_select_anon
  on public.recommendation_comments for select
  to anon using (true);

drop policy if exists rec_likes_select_anon on public.recommendation_likes;
create policy rec_likes_select_anon
  on public.recommendation_likes for select
  to anon using (true);
