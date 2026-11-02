-- =============================================================================
-- 0005 — Tickets, conversation, attachments, assignments, history, SLA state,
--        feedback
-- =============================================================================

create table public.tickets (
  id                  uuid primary key default gen_random_uuid(),
  reference           citext not null unique check (reference ~ '^CTS-[0-9]{4}-[0-9]{6}$'),
  customer_id         uuid not null references public.customers(profile_id) on delete restrict,
  organization_id     uuid references public.organizations(id) on delete set null,
  category_id         uuid not null references public.ticket_categories(id) on delete restrict,
  subcategory_id      uuid references public.ticket_categories(id) on delete restrict,
  subject             text not null check (char_length(subject) between 3 and 200),
  description         text not null check (char_length(description) between 10 and 20000),
  status              public.ticket_status not null default 'new',
  priority            public.priority_level not null default 'normal',
  channel             public.ticket_channel not null default 'web_portal',
  team_id             uuid references public.teams(id) on delete set null,
  assignee_id         uuid references public.profiles(id) on delete set null,
  locale              text not null default 'en' check (locale in ('en', 'ar')),
  source_ip           inet,
  first_response_at   timestamptz,
  last_public_reply_at timestamptz,
  last_customer_reply_at timestamptz,
  resolved_at         timestamptz,
  resolution_summary  text check (resolution_summary is null or char_length(resolution_summary) between 10 and 5000),
  closed_at           timestamptz,
  reopened_count      smallint not null default 0 check (reopened_count between 0 and 50),
  escalation_level    smallint not null default 0 check (escalation_level between 0 and 2),
  search_document     tsvector generated always as (
    to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tickets_resolution_summary_required check (
    status <> 'resolved' or resolution_summary is not null
  )
);

create index tickets_customer_idx on public.tickets (customer_id, created_at desc);
create index tickets_queue_idx    on public.tickets (team_id, status, priority, created_at desc);
create index tickets_assignee_idx on public.tickets (assignee_id, status) where assignee_id is not null;
create index tickets_org_idx      on public.tickets (organization_id) where organization_id is not null;
create index tickets_search_idx   on public.tickets using gin (search_document);
create index tickets_subject_trgm_idx on public.tickets using gin (subject gin_trgm_ops);

create trigger trg_tickets_touch
  before update on public.tickets
  for each row execute function app.tg_touch_updated_at();

create table public.ticket_messages (
  id                      uuid primary key default gen_random_uuid(),
  ticket_id               uuid not null references public.tickets(id) on delete cascade,
  author_id               uuid not null references public.profiles(id) on delete restrict,
  author_kind             public.message_author_kind not null,
  visibility              public.message_visibility not null,
  body                    text not null check (char_length(body) between 1 and 20000),
  body_locale             text check (body_locale is null or body_locale in ('en', 'ar')),
  is_initial_description  boolean not null default false,
  created_at              timestamptz not null default now(),
  edited_at               timestamptz,
  constraint ticket_messages_internal_is_staff check (
    visibility = 'public' or author_kind = 'agent'
  )
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

create table public.ticket_attachments (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.tickets(id) on delete cascade,
  message_id     uuid references public.ticket_messages(id) on delete cascade,
  uploader_id    uuid not null references public.profiles(id) on delete restrict,
  visibility     public.message_visibility not null default 'public',
  storage_path   text not null unique,
  file_name      text not null check (char_length(file_name) between 1 and 255),
  mime_type      text not null,
  size_bytes     integer not null check (size_bytes between 1 and 10485760),
  checksum_sha256 text,
  created_at     timestamptz not null default now()
);

create index ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);

create table public.ticket_assignments (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  team_id         uuid references public.teams(id) on delete set null,
  assignee_id     uuid references public.profiles(id) on delete set null,
  assignment_type public.assignment_type not null,
  reason          text check (reason is null or char_length(reason) <= 2000),
  assigned_by     uuid not null references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now()
);

create index ticket_assignments_ticket_idx on public.ticket_assignments (ticket_id, created_at desc);

create table public.ticket_status_history (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  from_status public.ticket_status,
  to_status   public.ticket_status not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  reason      text check (reason is null or char_length(reason) <= 2000),
  created_at  timestamptz not null default now()
);

create index ticket_status_history_ticket_idx on public.ticket_status_history (ticket_id, created_at);

create table public.ticket_custom_values (
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  field_id      uuid not null references public.custom_fields(id) on delete restrict,
  value_text    text,
  value_number  numeric,
  value_date    date,
  value_boolean boolean,
  value_json    jsonb,
  value_file_id uuid references public.ticket_attachments(id) on delete set null,
  primary key (ticket_id, field_id)
);

create table public.ticket_sla (
  ticket_id              uuid primary key references public.tickets(id) on delete cascade,
  policy_id              uuid not null references public.sla_policies(id) on delete restrict,
  first_response_due_at  timestamptz not null,
  resolution_due_at      timestamptz not null,
  first_response_met_at  timestamptz,
  resolution_met_at      timestamptz,
  first_response_breached boolean not null default false,
  resolution_breached    boolean not null default false,
  state                  public.sla_state not null default 'on_track',
  paused_at              timestamptz,
  total_paused_seconds   integer not null default 0 check (total_paused_seconds >= 0),
  warning_sent_at        timestamptz,
  breach_notified_at     timestamptz,
  updated_at             timestamptz not null default now()
);

create index ticket_sla_due_idx on public.ticket_sla (state, first_response_due_at, resolution_due_at);
create index ticket_sla_policy_idx on public.ticket_sla (policy_id);

create trigger trg_ticket_sla_touch
  before update on public.ticket_sla
  for each row execute function app.tg_touch_updated_at();

create table public.customer_feedback (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references public.tickets(id) on delete cascade,
  customer_id      uuid not null references public.customers(profile_id) on delete restrict,
  feedback_type    public.feedback_type not null,
  rating           smallint check (rating between 1 and 5),
  comment          text check (comment is null or char_length(comment) <= 2000),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  created_at       timestamptz not null default now(),
  constraint customer_feedback_shape check (
    (feedback_type = 'csat' and rating is not null)
    or (feedback_type <> 'csat' and rating is null)
  ),
  constraint customer_feedback_reject_reason check (
    feedback_type <> 'resolution_reject' or length(coalesce(rejection_reason, '')) >= 10
  )
);

create unique index customer_feedback_one_resolution
  on public.customer_feedback (ticket_id, feedback_type)
  where feedback_type in ('resolution_confirm', 'resolution_reject');

-- =============================================================================
-- Ticket integrity triggers
-- =============================================================================

-- Reference is immutable
create or replace function app.tg_ticket_reference_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.reference is distinct from old.reference then
    raise exception 'ticket reference is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_tickets_reference_immutable
  before update on public.tickets
  for each row execute function app.tg_ticket_reference_immutable();

-- Only matrix transitions are accepted
create or replace function app.tg_ticket_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not app.transition_allowed(old.status, new.status) then
      raise exception 'illegal ticket transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_tickets_transition_guard
  before update of status on public.tickets
  for each row execute function app.tg_ticket_transition_guard();

-- Timestamp stamping and reopen counting
create or replace function app.tg_ticket_stamp_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.closed_at   := null;
    elsif new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif new.status = 'reopened' then
      new.resolved_at     := null;
      new.closed_at       := null;
      new.reopened_count  := old.reopened_count + 1;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_tickets_stamp
  before update of status on public.tickets
  for each row execute function app.tg_ticket_stamp_timestamps();

-- An assignee must belong to the ticket's team
create or replace function app.tg_ticket_assignee_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assignee_id is not null then
    if new.team_id is null then
      raise exception 'cannot assign a ticket without a team' using errcode = '23514';
    end if;

    if app.is_admin() then
      return new;  -- explicit admin override, audited by the service layer
    end if;

    if not exists (
      select 1 from public.team_members tm
      where tm.team_id = new.team_id and tm.user_id = new.assignee_id and tm.is_active
    ) then
      raise exception 'assignee % is not an active member of team %', new.assignee_id, new.team_id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_tickets_assignee_scope
  before insert or update of assignee_id, team_id on public.tickets
  for each row execute function app.tg_ticket_assignee_scope();

-- A subcategory must be a direct child of the selected category
create or replace function app.tg_ticket_subcategory_parent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.subcategory_id is not null then
    if new.subcategory_id = new.category_id then
      raise exception 'subcategory must differ from category' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.ticket_categories c
      where c.id = new.subcategory_id and c.parent_id = new.category_id
    ) then
      raise exception 'subcategory % does not belong to category %', new.subcategory_id, new.category_id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_tickets_subcategory_parent
  before insert or update of subcategory_id, category_id on public.tickets
  for each row execute function app.tg_ticket_subcategory_parent();

-- Audit staff mutations
create or replace function app.tg_ticket_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'ticket.status_changed', 'ticket', new.id,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;

  if new.priority is distinct from old.priority then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'ticket.priority_changed', 'ticket', new.id,
            jsonb_build_object('priority', old.priority), jsonb_build_object('priority', new.priority));
  end if;

  if new.assignee_id is distinct from old.assignee_id or new.team_id is distinct from old.team_id then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'ticket.assignment_changed', 'ticket', new.id,
            jsonb_build_object('assignee_id', old.assignee_id, 'team_id', old.team_id),
            jsonb_build_object('assignee_id', new.assignee_id, 'team_id', new.team_id));
  end if;

  return new;
end;
$$;

create trigger trg_tickets_audit
  after update on public.tickets
  for each row execute function app.tg_ticket_audit();