-- =============================================================================
-- 0003 — Teams, ticket catalogue, custom fields, settings, audit
-- =============================================================================

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name_en    text not null check (char_length(name_en) between 1 and 120),
  name_ar    text not null check (char_length(name_ar) between 1 and 120),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code          citext not null unique check (code ~ '^[a-z0-9_-]{2,32}$'),
  name_en       text not null check (char_length(name_en) between 1 and 120),
  name_ar       text not null check (char_length(name_ar) between 1 and 120),
  description   text check (description is null or char_length(description) <= 1000),
  email         citext,
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index teams_single_default on public.teams ((is_default)) where is_default;

create trigger trg_departments_touch
  before update on public.departments
  for each row execute function app.tg_touch_updated_at();

create trigger trg_teams_touch
  before update on public.teams
  for each row execute function app.tg_touch_updated_at();

create table public.team_members (
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  team_role  public.team_role not null default 'member',
  is_active  boolean not null default true,
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id) where is_active;

-- ---------------------------------------------------------------------------
-- Categories (max depth 2: category -> subcategory)
-- ---------------------------------------------------------------------------
create table public.ticket_categories (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid references public.ticket_categories(id) on delete restrict,
  -- Codes are hierarchical: root categories are single words, subcategories are
  -- `parent.child`, so a dot is part of the allowed alphabet.
  code             citext not null unique check (code ~ '^[a-z0-9_-]{2,32}(\.[a-z0-9_-]{2,32})?$'),
  name_en          text not null check (char_length(name_en) between 1 and 120),
  name_ar          text not null check (char_length(name_ar) between 1 and 120),
  description_en   text,
  description_ar   text,
  default_team_id  uuid references public.teams(id) on delete set null,
  default_priority public.priority_level,
  sla_policy_id    uuid,  -- FK added in 0004 once sla_policies exists
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index ticket_categories_parent_idx on public.ticket_categories (parent_id, sort_order);

create trigger trg_ticket_categories_touch
  before update on public.ticket_categories
  for each row execute function app.tg_touch_updated_at();

create or replace function app.tg_category_depth()
returns trigger
language plpgsql
as $$
declare
  v_grandparent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id into v_grandparent
  from public.ticket_categories
  where id = new.parent_id;

  if v_grandparent is not null then
    raise exception 'ticket categories support only two levels' using errcode = '23514';
  end if;

  if new.id is not null and new.parent_id = new.id then
    raise exception 'a category cannot be its own parent' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_ticket_categories_depth
  before insert or update on public.ticket_categories
  for each row execute function app.tg_category_depth();

-- ---------------------------------------------------------------------------
-- Custom fields
-- ---------------------------------------------------------------------------
create table public.custom_fields (
  id           uuid primary key default gen_random_uuid(),
  code         citext not null unique check (code ~ '^[a-z0-9_]{2,48}$'),
  label_en     text not null,
  label_ar     text not null,
  field_type   public.custom_field_type not null,
  help_text_en text,
  help_text_ar text,
  options      jsonb,
  validation   jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint custom_fields_options_required check (
    field_type not in ('dropdown', 'multiselect', 'radio') or options is not null
  ),
  constraint custom_fields_options_shape check (
    options is null or jsonb_typeof(options) = 'array'
  )
);

create trigger trg_custom_fields_touch
  before update on public.custom_fields
  for each row execute function app.tg_touch_updated_at();

create table public.category_custom_fields (
  category_id          uuid not null references public.ticket_categories(id) on delete cascade,
  field_id             uuid not null references public.custom_fields(id) on delete restrict,
  is_required          boolean not null default false,
  visible_to_customer  boolean not null default true,
  sort_order           integer not null default 0,
  primary key (category_id, field_id)
);

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_]+$'),
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create trigger trg_app_settings_touch
  before update on public.app_settings
  for each row execute function app.tg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit trail — append only
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_role  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  request_id  text,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace function app.tg_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.tg_audit_immutable();
