-- =============================================================================
-- 0001 — Extensions, enumerations, shared helpers, schemas
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

create schema if not exists app;
comment on schema app is 'Internal helper functions and RPCs. Not exposed through the API.';

grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.role_code as enum
  ('customer', 'agent', 'team_leader', 'admin', 'management_viewer');

create type public.account_status as enum
  ('pending', 'active', 'suspended', 'deactivated');

create type public.ticket_status as enum
  ('new', 'open', 'in_progress', 'pending_customer', 'pending_internal', 'resolved', 'closed', 'reopened');

create type public.priority_level as enum
  ('critical', 'high', 'normal', 'low');

create type public.sla_state as enum
  ('on_track', 'due_soon', 'breached', 'paused', 'completed');

create type public.message_visibility as enum ('public', 'internal');

create type public.message_author_kind as enum ('customer', 'agent', 'system');

create type public.assignment_type as enum
  ('initial', 'reassign', 'escalate', 'unassign', 'auto');

create type public.team_role as enum ('member', 'leader');

create type public.custom_field_type as enum
  ('text', 'textarea', 'number', 'date', 'dropdown', 'multiselect', 'checkbox', 'radio', 'file');

create type public.feedback_type as enum
  ('resolution_confirm', 'resolution_reject', 'csat');

create type public.ticket_channel as enum ('web_portal');

create type public.kb_status as enum ('draft', 'published', 'archived');

create type public.kb_visibility as enum ('public', 'internal');

create type public.delivery_status as enum
  ('queued', 'sending', 'sent', 'failed', 'suppressed');

create type public.job_status as enum ('running', 'succeeded', 'failed');

create type public.notification_event as enum
  ('ticket_created', 'ticket_assigned', 'ticket_reassigned', 'ticket_replied',
   'ticket_status_changed', 'ticket_priority_changed', 'sla_warning', 'sla_breached',
   'ticket_resolved', 'ticket_closed', 'ticket_reopened', 'ticket_escalated',
   'feedback_received');

-- ---------------------------------------------------------------------------
-- Generic trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create or replace function app.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status transition matrix — the single source of truth for the database.
-- Mirrors src/modules/tickets/domain/transitions.ts. Both are asserted equal
-- by a unit test; the trigger is what actually enforces it.
-- ---------------------------------------------------------------------------
create or replace function app.transition_allowed(p_from public.ticket_status, p_to public.ticket_status)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from (values
      ('new'::public.ticket_status,              'open'::public.ticket_status),
      ('new',                                    'in_progress'),
      ('new',                                    'resolved'),
      ('open',                                   'in_progress'),
      ('open',                                   'pending_customer'),
      ('open',                                   'pending_internal'),
      ('open',                                   'resolved'),
      ('in_progress',                            'pending_customer'),
      ('in_progress',                            'pending_internal'),
      ('in_progress',                            'resolved'),
      ('pending_customer',                       'in_progress'),
      ('pending_customer',                       'resolved'),
      ('pending_internal',                       'in_progress'),
      ('pending_internal',                       'pending_customer'),
      ('pending_internal',                       'resolved'),
      ('resolved',                               'closed'),
      ('resolved',                               'reopened'),
      ('closed',                                 'reopened'),
      ('reopened',                               'open'),
      ('reopened',                               'in_progress'),
      ('reopened',                               'pending_customer'),
      ('reopened',                               'pending_internal'),
      ('reopened',                               'resolved')
    ) as m(from_status, to_status)
    where m.from_status = p_from and m.to_status = p_to
  );
$$;

comment on function app.transition_allowed is
  'Allowed ticket status transitions. Any pair absent from this list is rejected by trg_tickets_guard.';

-- ---------------------------------------------------------------------------
-- Business-hours arithmetic
-- ---------------------------------------------------------------------------
create or replace function app.add_business_minutes(
  p_calendar_id uuid,
  p_start       timestamptz,
  p_minutes     integer
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz        text;
  v_remaining integer := p_minutes;
  v_cursor    timestamptz := p_start;
  v_day       date;
  v_dow       integer;
  v_win       record;
  v_win_start timestamptz;
  v_win_end   timestamptz;
  v_available integer;
  v_iter      integer := 0;
begin
  select c.timezone into v_tz
  from public.business_calendars c
  where c.id = p_calendar_id;

  if v_tz is null then
    raise exception 'business calendar % not found', p_calendar_id
      using errcode = 'P0002';
  end if;

  if p_minutes <= 0 then
    return p_start;
  end if;

  v_day := (p_start at time zone v_tz)::date;

  while v_remaining > 0 loop
    v_iter := v_iter + 1;
    if v_iter > 400 then
      raise exception 'business minutes overflow for calendar % (no working hours?)', p_calendar_id
        using errcode = 'P0001';
    end if;

    v_dow := extract(dow from v_day)::integer;

    if not exists (
      select 1 from public.holidays h
      where h.calendar_id = p_calendar_id
        and (
          h.holiday_date = v_day
          or (h.is_recurring
              and extract(month from h.holiday_date) = extract(month from v_day)
              and extract(day   from h.holiday_date) = extract(day   from v_day))
        )
    ) then
      for v_win in
        select bh.start_time, bh.end_time
        from public.business_hours bh
        where bh.calendar_id = p_calendar_id and bh.day_of_week = v_dow
        order by bh.start_time
      loop
        v_win_start := (v_day::timestamp + v_win.start_time) at time zone v_tz;
        v_win_end   := (v_day::timestamp + v_win.end_time)   at time zone v_tz;

        continue when v_win_end <= v_cursor;
        if v_win_start < v_cursor then
          v_win_start := v_cursor;
        end if;

        v_available := floor(extract(epoch from (v_win_end - v_win_start)) / 60)::integer;

        if v_available >= v_remaining then
          return v_win_start + make_interval(mins => v_remaining);
        end if;

        v_remaining := v_remaining - v_available;
        v_cursor    := v_win_end;
      end loop;
    end if;

    v_day := v_day + 1;
    v_cursor := greatest(v_cursor, (v_day::timestamp) at time zone v_tz);
  end loop;

  return v_cursor;
end;
$$;

comment on function app.add_business_minutes is
  'Adds N business minutes to a timestamp using the calendar''s working hours, holidays and time zone. '
  'Used for both first-response and resolution due dates.';

-- ---------------------------------------------------------------------------
-- Ticket reference allocation (concurrency-safe)
-- ---------------------------------------------------------------------------
create table public.ticket_sequences (
  year       smallint primary key,
  last_value bigint   not null default 0 check (last_value >= 0)
);

alter table public.ticket_sequences enable row level security;
-- No policies: reachable only through app.next_ticket_reference (security definer).

create or replace function app.next_ticket_reference(p_year smallint)
returns citext
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next bigint;
begin
  insert into public.ticket_sequences (year, last_value)
  values (p_year, 1)
  on conflict (year) do update
    set last_value = public.ticket_sequences.last_value + 1
  returning last_value into v_next;

  return format('CTS-%s-%s', p_year, lpad(v_next::text, 6, '0'))::citext;
end;
$$;

comment on function app.next_ticket_reference is
  'Allocates the next per-year reference. ON CONFLICT DO UPDATE takes a row lock, so concurrent '
  'submissions serialize and can never receive the same number.';
