-- =============================================================================
-- 0006 — Knowledgebase, notifications, delivery outbox, infrastructure tables
-- =============================================================================

create table public.kb_categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.kb_categories(id) on delete restrict,
  slug       citext not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  name_en    text not null,
  name_ar    text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_kb_categories_touch
  before update on public.kb_categories
  for each row execute function app.tg_touch_updated_at();

create table public.kb_articles (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid not null references public.kb_categories(id) on delete restrict,
  slug              citext not null unique check (slug ~ '^[a-z0-9-]{2,120}$'),
  title_en          text not null check (char_length(title_en) between 3 and 200),
  title_ar          text not null check (char_length(title_ar) between 3 and 200),
  body_en           text not null,
  body_ar           text not null,
  visibility        public.kb_visibility not null default 'public',
  status            public.kb_status not null default 'draft',
  published_at      timestamptz,
  view_count        integer not null default 0,
  helpful_count     integer not null default 0,
  not_helpful_count integer not null default 0,
  search_document   tsvector generated always as (
    to_tsvector('simple',
      coalesce(title_en, '') || ' ' || coalesce(title_ar, '') || ' ' ||
      coalesce(body_en, '')  || ' ' || coalesce(body_ar, ''))
  ) stored,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint kb_articles_published_has_date check (
    status <> 'published' or published_at is not null
  )
);

create index kb_articles_search_idx on public.kb_articles using gin (search_document);
create index kb_articles_category_idx on public.kb_articles (category_id, status);
create index kb_articles_title_trgm_idx on public.kb_articles using gin (title_en gin_trgm_ops);

create trigger trg_kb_articles_touch
  before update on public.kb_articles
  for each row execute function app.tg_touch_updated_at();

create table public.kb_category_links (
  article_id  uuid not null references public.kb_articles(id) on delete cascade,
  category_id uuid not null references public.ticket_categories(id) on delete cascade,
  primary key (article_id, category_id)
);

create table public.kb_article_feedback (
  article_id uuid not null references public.kb_articles(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  ticket_id  uuid references public.tickets(id) on delete cascade,
  event      public.notification_event not null,
  title_en   text not null,
  title_ar   text not null,
  body_en    text not null,
  body_ar    text not null,
  link_url   text check (link_url is null or link_url ~ '^/'),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete set null,
  template_code   text not null,
  recipient_email citext not null,
  locale          text not null check (locale in ('en', 'ar')),
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text unique,
  status          public.delivery_status not null default 'queued',
  attempts        smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notification_deliveries_queue_idx
  on public.notification_deliveries (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Infrastructure tables (no API access)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  counter      integer not null default 0 check (counter >= 0),
  primary key (bucket, window_start)
);

create table public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  job_name    text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      public.job_status not null default 'running',
  processed   integer not null default 0,
  failed      integer not null default 0,
  detail      jsonb
);

create index job_runs_name_idx on public.job_runs (job_name, started_at desc);

create or replace function app.consume_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_counter      integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, counter)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start) do update
    set counter = public.rate_limits.counter + 1
  returning counter into v_counter;

  delete from public.rate_limits
   where window_start < now() - interval '1 day';

  return v_counter <= p_limit;
end;
$$;

comment on function app.consume_rate_limit is
  'Fixed-window counter shared by all server instances (no in-memory state). Returns false when '
  'the caller has exceeded the allowance for the window.';