-- =============================================================================
-- 0002 — Identity: profiles, roles, permissions, organizations, customers
-- =============================================================================

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        public.role_code not null unique,
  name_en     text not null,
  name_ar     text not null,
  is_internal boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z]+(\.[a-z_]+)+$'),
  description text not null
);

create table public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 160),
  code          citext unique,
  domain        citext unique,
  share_tickets boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger trg_organizations_touch
  before update on public.organizations
  for each row execute function app.tg_touch_updated_at();

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete restrict,
  email             citext not null unique,
  full_name         text not null check (char_length(full_name) between 1 and 120),
  phone             text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  locale            text not null default 'en' check (locale in ('en', 'ar')),
  timezone          text not null default 'Asia/Riyadh',
  avatar_url        text,
  account_status    public.account_status not null default 'pending',
  is_staff          boolean not null default false,
  email_verified_at timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.profiles.is_staff is
  'Derived from user_roles by trigger. Never writable by the user (enforced in app.guard_profile_update).';

create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function app.tg_touch_updated_at();

create index profiles_email_idx on public.profiles (email);
create index profiles_staff_idx on public.profiles (is_staff) where is_staff;

create table public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid not null references public.roles(id) on delete restrict,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index user_roles_user_idx on public.user_roles (user_id);

create table public.customers (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  job_title         text check (job_title is null or char_length(job_title) <= 120),
  company_name      text check (company_name is null or char_length(company_name) <= 160),
  preferred_contact text not null default 'email' check (preferred_contact in ('email', 'phone')),
  notes_internal    text check (notes_internal is null or char_length(notes_internal) <= 4000),
  registered_at     timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.customers.notes_internal is
  'Staff-only notes about the customer. Never returned to the customer by any view or policy.';

create trigger trg_customers_touch
  before update on public.customers
  for each row execute function app.tg_touch_updated_at();

create index customers_org_idx on public.customers (organization_id) where organization_id is not null;

-- ---------------------------------------------------------------------------
-- is_staff is derived, never client-supplied
-- ---------------------------------------------------------------------------
create or replace function app.recalc_is_staff(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles p
     set is_staff = exists (
           select 1
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id
           where ur.user_id = p_user_id and r.is_internal
         )
   where p.id = p_user_id;
$$;

create or replace function app.tg_user_roles_sync_staff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform app.recalc_is_staff(old.user_id);
    return old;
  end if;
  perform app.recalc_is_staff(new.user_id);
  return new;
end;
$$;

create trigger trg_user_roles_sync_staff
  after insert or update or delete on public.user_roles
  for each row execute function app.tg_user_roles_sync_staff();

-- ---------------------------------------------------------------------------
-- Profile self-update guard: role and status columns are not user-writable
-- ---------------------------------------------------------------------------
create or replace function app.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- service role and definer contexts bypass; authenticated users are constrained
  if auth.uid() is null or app.is_admin() then
    return new;
  end if;

  if new.is_staff is distinct from old.is_staff then
    raise exception 'is_staff is not writable' using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'account_status is not writable' using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'email is managed by authentication' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function app.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Signup: mirror auth.users into profiles and grant the customer role.
-- Staff accounts are provisioned by an admin afterwards; this trigger never
-- grants an internal role.
-- ---------------------------------------------------------------------------
create or replace function app.tg_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_full_name text;
  v_locale    text;
  v_role_id   uuid;
begin
  v_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_full_name is null then
    v_full_name := split_part(coalesce(new.email, 'User'), '@', 1);
  end if;

  v_locale := coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en');
  if v_locale not in ('en', 'ar') then
    v_locale := 'en';
  end if;

  insert into public.profiles (id, email, full_name, locale, account_status, email_verified_at)
  values (
    new.id,
    new.email,
    left(v_full_name, 120),
    v_locale,
    case when new.email_confirmed_at is null then 'pending'::public.account_status
         else 'active'::public.account_status end,
    new.email_confirmed_at
  )
  on conflict (id) do nothing;

  select id into v_role_id from public.roles where code = 'customer';
  if v_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, v_role_id)
    on conflict do nothing;
  end if;

  insert into public.customers (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function app.tg_auth_user_created();

-- Email confirmation flips pending -> active
create or replace function app.tg_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles
       set account_status    = 'active',
           email_verified_at = new.email_confirmed_at
     where id = new.id
       and account_status = 'pending';
  end if;
  return new;
end;
$$;

create trigger trg_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function app.tg_auth_user_confirmed();
