-- =============================================================================
-- 0004 — SLA configuration: calendars, working hours, holidays, policies
-- =============================================================================

create table public.business_calendars (
  id         uuid primary key default gen_random_uuid(),
  code       citext not null unique check (code ~ '^[a-z0-9_]{2,32}$'),
  name_en    text not null,
  name_ar    text not null,
  timezone   text not null default 'Asia/Riyadh',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_business_calendars_touch
  before update on public.business_calendars
  for each row execute function app.tg_touch_updated_at();

create table public.business_hours (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.business_calendars(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  constraint business_hours_ordered check (start_time < end_time)
);

create index business_hours_calendar_idx on public.business_hours (calendar_id, day_of_week);

create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.business_calendars(id) on delete cascade,
  holiday_date date not null,
  name_en      text not null,
  name_ar      text not null,
  is_recurring boolean not null default false,
  unique (calendar_id, holiday_date)
);

create index holidays_calendar_idx on public.holidays (calendar_id, holiday_date);

create table public.sla_policies (
  id                         uuid primary key default gen_random_uuid(),
  code                       citext not null unique check (code ~ '^[a-z0-9_]{2,48}$'),
  name_en                    text not null,
  name_ar                    text not null,
  calendar_id                uuid not null references public.business_calendars(id) on delete restrict,
  team_id                    uuid references public.teams(id) on delete set null,
  category_id                uuid references public.ticket_categories(id) on delete set null,
  is_default                 boolean not null default false,
  pause_on_pending_customer  boolean not null default true,
  pause_on_pending_internal  boolean not null default false,
  warning_threshold_pct      smallint not null default 80 check (warning_threshold_pct between 10 and 100),
  escalate_at_pct            smallint not null default 100 check (escalate_at_pct between 50 and 200),
  is_active                  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz
);

create unique index sla_policies_single_default on public.sla_policies ((is_default)) where is_default;

create trigger trg_sla_policies_touch
  before update on public.sla_policies
  for each row execute function app.tg_touch_updated_at();

create table public.sla_policy_targets (
  policy_id            uuid not null references public.sla_policies(id) on delete cascade,
  priority             public.priority_level not null,
  first_response_minutes integer not null check (first_response_minutes between 1 and 20160),
  resolution_minutes     integer not null check (resolution_minutes between 5 and 100800),
  primary key (policy_id, priority),
  constraint sla_targets_ordered check (resolution_minutes >= first_response_minutes)
);

alter table public.ticket_categories
  add constraint ticket_categories_sla_policy_fk
  foreign key (sla_policy_id) references public.sla_policies(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Policy selection — deterministic, first match wins
-- ---------------------------------------------------------------------------
create or replace function app.resolve_sla_policy(
  p_category_id uuid,
  p_team_id     uuid,
  p_subcategory_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select p.id,
           case
             when p.category_id = p_subcategory_id and p.team_id = p_team_id then 1
             when p.category_id = p_category_id     and p.team_id = p_team_id then 2
             when p.category_id = p_subcategory_id                          then 3
             when p.category_id = p_category_id                             then 4
             when p.team_id = p_team_id                                     then 5
             when p.is_default                                              then 6
             else 99
           end as rank
    from public.sla_policies p
    where p.is_active
      and p.deleted_at is null
      and (
        (p.category_id is not null and p.category_id in (p_category_id, p_subcategory_id))
        or p.team_id = p_team_id
        or p.is_default
      )
  )
  select id from candidates where rank < 99 order by rank limit 1;
$$;

comment on function app.resolve_sla_policy is
  'Category+team > category > team > default. Returns null when nothing matches, which the '
  'creation RPC treats as a configuration error rather than creating a ticket without an SLA.';
