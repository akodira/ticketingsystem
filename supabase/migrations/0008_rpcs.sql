-- =============================================================================
-- 0008 — RPCs: the only supported write paths for multi-row business operations
--
-- Every function:
--   * is SECURITY DEFINER so it can write history/sla/audit rows the caller
--     may not touch directly,
--   * re-derives the actor from auth.uid() (never trusts a caller-supplied id),
--   * re-checks authorization itself — RLS does not protect a definer function,
--   * raises on any rule violation so the whole operation rolls back.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Authorization: does the actor hold a permission code?
-- ---------------------------------------------------------------------------
create or replace function app.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid() and p.code = p_code
  );
$$;

create or replace function app.assert_permission(p_code text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_permission(p_code) then
    raise exception 'permission denied: %', p_code using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.create_ticket
-- ---------------------------------------------------------------------------
create or replace function app.create_ticket(
  p_category_id    uuid,
  p_subcategory_id uuid,
  p_subject        text,
  p_description    text,
  p_priority       public.priority_level,
  p_custom_values  jsonb default '{}'::jsonb,
  p_source_ip      inet  default null
)
-- OUT parameters are prefixed to avoid colliding with column names of the tables
-- this function queries (`id`, `reference`) — plpgsql treats them as variables,
-- and an unqualified `where id = ...` then becomes ambiguous.
returns table (ticket_id uuid, ticket_reference citext)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor        uuid := auth.uid();
  v_profile      public.profiles%rowtype;
  v_category     public.ticket_categories%rowtype;
  v_ticket_id    uuid := gen_random_uuid();
  v_reference    citext;
  v_team_id      uuid;
  v_priority     public.priority_level := coalesce(p_priority, 'normal');
  v_policy_id    uuid;
  v_calendar_id  uuid;
  v_target       public.sla_policy_targets%rowtype;
  v_message_id   uuid := gen_random_uuid();
  v_locale       text;
  v_orgh_id      uuid;
  v_allow_customer_priority boolean;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform app.assert_permission('ticket.create.self');

  select * into v_profile from public.profiles where id = v_actor;
  if not found or v_profile.account_status <> 'active' then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  if v_profile.is_staff then
    raise exception 'staff accounts cannot raise tickets' using errcode = '42501';
  end if;

  select * into v_category from public.ticket_categories where id = p_category_id;
  if not found or not v_category.is_active or v_category.deleted_at is not null then
    raise exception 'invalid category' using errcode = '22023';
  end if;

  if p_subcategory_id is not null then
    if not exists (
      select 1 from public.ticket_categories c
      where c.id = p_subcategory_id and c.parent_id = p_category_id
        and c.is_active and c.deleted_at is null
    ) then
      raise exception 'invalid subcategory for the selected category' using errcode = '22023';
    end if;
  end if;

  -- Customer priority is a request, and only when the setting allows it
  select coalesce((value)::boolean, true) into v_allow_customer_priority
  from public.app_settings where key = 'allow_customer_priority';
  if v_allow_customer_priority is null then
    v_allow_customer_priority := true;
  end if;
  if not v_allow_customer_priority then
    v_priority := coalesce(v_category.default_priority, 'normal');
  end if;

  v_team_id := coalesce(
    (select default_team_id from public.ticket_categories where id = p_category_id),
    (select id from public.teams where is_default and is_active and deleted_at is null limit 1)
  );

  select c.organization_id into v_orgh_id from public.customers c where c.profile_id = v_actor;

  select p.locale into v_locale from public.profiles p where p.id = v_actor;

  v_reference := app.next_ticket_reference(extract(year from now())::smallint);

  insert into public.tickets (
    id, reference, customer_id, organization_id, category_id, subcategory_id,
    subject, description, status, priority, team_id, locale, source_ip
  ) values (
    v_ticket_id, v_reference, v_actor, v_orgh_id, p_category_id, p_subcategory_id,
    p_subject, p_description, 'new', v_priority, v_team_id, coalesce(v_locale, 'en'), p_source_ip
  );

  insert into public.ticket_messages (
    id, ticket_id, author_id, author_kind, visibility, body, body_locale, is_initial_description
  ) values (
    v_message_id, v_ticket_id, v_actor, 'customer', 'public', p_description, coalesce(v_locale, 'en'), true
  );

  insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by, reason)
  values (v_ticket_id, null, 'new', v_actor, null);

  -- SLA policy is mandatory: a ticket without one would silently escape SLA tracking
  v_policy_id := app.resolve_sla_policy(p_category_id, v_team_id, p_subcategory_id);
  if v_policy_id is null then
    raise exception 'no SLA policy configured for this category/team — contact an administrator'
      using errcode = 'P0001';
  end if;

  select calendar_id into v_calendar_id from public.sla_policies where id = v_policy_id;

  select * into v_target from public.sla_policy_targets
  where policy_id = v_policy_id and priority = v_priority;
  if not found then
    raise exception 'SLA policy % has no target for priority %', v_policy_id, v_priority
      using errcode = 'P0001';
  end if;

  insert into public.ticket_sla (
    ticket_id, policy_id, first_response_due_at, resolution_due_at
  ) values (
    v_ticket_id, v_policy_id,
    app.add_business_minutes(v_calendar_id, now(), v_target.first_response_minutes),
    app.add_business_minutes(v_calendar_id, now(), v_target.resolution_minutes)
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_actor, 'ticket.created', 'ticket', v_ticket_id,
          jsonb_build_object('reference', v_reference, 'category_id', p_category_id,
                             'priority', v_priority, 'team_id', v_team_id));

  return query select v_ticket_id, v_reference;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.add_message
-- ---------------------------------------------------------------------------
create or replace function app.add_message(
  p_ticket_id uuid,
  p_body      text,
  p_visibility public.message_visibility default 'public'
)
returns table (message_id uuid, new_status public.ticket_status)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor     uuid := auth.uid();
  v_staff     boolean;
  v_ticket    public.tickets%rowtype;
  v_kind      public.message_author_kind;
  v_visibility public.message_visibility;
  v_msg_id    uuid := gen_random_uuid();
  v_new_status public.ticket_status;
  v_policy    public.sla_policies%rowtype;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not app.can_write_ticket(p_ticket_id) then
    raise exception 'ticket not accessible' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  if v_ticket.status = 'closed' then
    raise exception 'closed tickets cannot receive messages' using errcode = '23514';
  end if;

  v_staff := app.is_staff();
  if v_staff then
    if app.is_read_only_viewer() then
      raise exception 'read-only viewers cannot reply' using errcode = '42501';
    end if;
    v_kind := 'agent';
    v_visibility := coalesce(p_visibility, 'public');
    if v_visibility = 'internal' then
      perform app.assert_permission('ticket.note.internal');
    end if;
  else
    -- Customer: visibility is forced, never trusted from the caller
    if v_ticket.customer_id <> v_actor then
      raise exception 'ticket not accessible' using errcode = '42501';
    end if;
    if app.is_read_only_viewer() then
      raise exception 'read-only viewers cannot reply' using errcode = '42501';
    end if;
    v_kind := 'customer';
    v_visibility := 'public';
  end if;

  insert into public.ticket_messages (id, ticket_id, author_id, author_kind, visibility, body, body_locale)
  values (v_msg_id, p_ticket_id, v_actor, v_kind, v_visibility, p_body,
          (select locale from public.profiles where id = v_actor));

  v_new_status := v_ticket.status;

  if v_visibility = 'public' then
    if v_staff then
      v_new_status := case
        when v_ticket.status = 'new' then 'in_progress'::public.ticket_status
        when v_ticket.status = 'open' then 'in_progress'::public.ticket_status
        when v_ticket.status = 'pending_internal' then 'in_progress'::public.ticket_status
        else v_ticket.status
      end;

      update public.tickets
         set last_public_reply_at = now(),
             first_response_at = coalesce(first_response_at, now()),
             status = v_new_status
       where id = p_ticket_id;

      update public.ticket_sla
         set first_response_met_at = now()
       where ticket_id = p_ticket_id and first_response_met_at is null
         and first_response_breached = false;
    else
      v_new_status := case
        when v_ticket.status = 'pending_customer' then 'in_progress'::public.ticket_status
        else v_ticket.status
      end;

      update public.tickets
         set last_customer_reply_at = now(),
             status = v_new_status
       where id = p_ticket_id;
    end if;
  end if;

  -- SLA pause/resume driven by the status change
  select sp.* into v_policy
  from public.sla_policies sp
  join public.ticket_sla ts on ts.policy_id = sp.id
  where ts.ticket_id = p_ticket_id;

  if v_policy.id is not null then
    if v_new_status = 'pending_customer' and v_policy.pause_on_pending_customer then
      update public.ticket_sla
         set state = 'paused', paused_at = coalesce(paused_at, now())
       where ticket_id = p_ticket_id and paused_at is null;
    elsif v_ticket.status = 'pending_customer' and v_new_status <> 'pending_customer' then
      update public.ticket_sla
         set first_response_due_at =
               first_response_due_at + (now() - paused_at),
             resolution_due_at =
               resolution_due_at + (now() - paused_at),
             total_paused_seconds = total_paused_seconds
               + extract(epoch from (now() - paused_at))::integer,
             paused_at = null,
             state = 'on_track'
       where ticket_id = p_ticket_id and paused_at is not null;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_actor, 'ticket.message_added', 'ticket', p_ticket_id,
          jsonb_build_object('message_id', v_msg_id, 'visibility', v_visibility));

  return query select v_msg_id, v_new_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.transition_ticket
-- ---------------------------------------------------------------------------
create or replace function app.transition_ticket(
  p_ticket_id uuid,
  p_to        public.ticket_status,
  p_reason    text default null,
  p_resolution_summary text default null
)
returns public.ticket_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_staff  boolean := app.is_staff();
  v_is_customer_actor boolean;
  v_policy public.sla_policies%rowtype;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not app.can_write_ticket(p_ticket_id) then
    raise exception 'ticket not accessible' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  if not app.transition_allowed(v_ticket.status, p_to) then
    raise exception 'illegal ticket transition: % -> %', v_ticket.status, p_to
      using errcode = '23514';
  end if;

  v_is_customer_actor := v_ticket.customer_id = v_actor;

  if v_is_customer_actor then
    if p_to = 'closed' then
      perform app.assert_permission('ticket.reopen.own');  -- same trust tier: own-ticket actions
    elsif p_to = 'reopened' then
      perform app.assert_permission('ticket.reopen.own');
      if v_ticket.reopened_count >= coalesce(
           (select (value)::integer from public.app_settings where key = 'max_reopens'), 3) then
        raise exception 'reopen limit reached' using errcode = '23514';
      end if;
    else
      raise exception 'customers may only confirm, reject or reopen' using errcode = '42501';
    end if;

    if p_to = 'reopened' and v_ticket.status = 'closed' then
      perform app.assert_permission('ticket.reopen.own');
    end if;
  else
    if app.is_read_only_viewer() then
      raise exception 'read-only viewers cannot change ticket state' using errcode = '42501';
    end if;

    if p_to = 'closed' then
      perform app.assert_permission('ticket.close.any');
    else
      perform app.assert_permission('ticket.status.transition.team');
    end if;

    if p_to = 'resolved' and length(coalesce(p_resolution_summary, '')) < 10 then
      raise exception 'a resolution summary of at least 10 characters is required'
        using errcode = '22023';
    end if;
  end if;

  if p_to = 'reopened' and length(coalesce(p_reason, '')) < 10 then
    raise exception 'a reason of at least 10 characters is required to reopen'
      using errcode = '22023';
  end if;

  update public.tickets
     set status = p_to,
         resolution_summary = case when p_to = 'resolved' then p_resolution_summary
                                   when p_to = 'reopened' then null
                                   else resolution_summary end
   where id = p_ticket_id;

  insert into public.ticket_status_history (ticket_id, from_status, to_status, changed_by, reason)
  values (p_ticket_id, v_ticket.status, p_to, v_actor, p_reason);

  select sp.* into v_policy
  from public.sla_policies sp
  join public.ticket_sla ts on ts.policy_id = sp.id
  where ts.ticket_id = p_ticket_id;

  if p_to = 'resolved' then
    update public.ticket_sla
       set resolution_met_at = now(),
           state = case when first_response_breached or resolution_breached then 'breached'
                        else 'completed' end
     where ticket_id = p_ticket_id;
  elsif p_to = 'reopened' then
    update public.ticket_sla
       set state = case when paused_at is not null then 'paused' else 'on_track' end,
           resolution_met_at = null
     where ticket_id = p_ticket_id;
    update public.tickets set resolved_at = null, closed_at = null where id = p_ticket_id;
  elsif p_to = 'pending_customer' and v_policy.pause_on_pending_customer then
    update public.ticket_sla
       set state = 'paused', paused_at = coalesce(paused_at, now())
     where ticket_id = p_ticket_id;
  elsif p_to = 'pending_internal' and v_policy.pause_on_pending_internal then
    update public.ticket_sla
       set state = 'paused', paused_at = coalesce(paused_at, now())
     where ticket_id = p_ticket_id;
  end if;

  return p_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.assign_ticket
-- ---------------------------------------------------------------------------
create or replace function app.assign_ticket(
  p_ticket_id  uuid,
  p_team_id    uuid,
  p_assignee_id uuid,
  p_type       public.assignment_type default 'reassign',
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_can_assign boolean;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if app.is_read_only_viewer() then
    raise exception 'read-only viewers cannot assign tickets' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  -- Authorization: admin anywhere, leader within own team, agent only to self within own team
  if app.is_admin() then
    v_can_assign := true;
  elsif p_team_id = any (app.my_leader_team_ids()) then
    v_can_assign := true;
  elsif app.is_staff() and app.has_permission('ticket.assign.self')
        and (p_assignee_id is null or p_assignee_id = v_actor)
        and (p_team_id is null or p_team_id = any (app.my_team_ids())) then
    v_can_assign := true;
  else
    v_can_assign := false;
  end if;

  if not v_can_assign then
    raise exception 'not permitted to assign this ticket' using errcode = '42501';
  end if;

  if p_assignee_id is not null then
    if p_team_id is null then
      raise exception 'a team is required to assign an assignee' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.team_members tm
      where tm.team_id = p_team_id and tm.user_id = p_assignee_id and tm.is_active
    ) then
      raise exception 'assignee is not an active member of the target team' using errcode = '23514';
    end if;
  end if;

  update public.tickets
     set team_id = p_team_id,
         assignee_id = p_assignee_id,
         status = case when status = 'new' and p_assignee_id is not null then 'open' else status end
   where id = p_ticket_id;

  insert into public.ticket_assignments (ticket_id, team_id, assignee_id, assignment_type, reason, assigned_by)
  values (p_ticket_id, p_team_id, p_assignee_id, p_type, p_reason, v_actor);

  update public.ticket_sla set updated_at = now() where ticket_id = p_ticket_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.refresh_sla_state — recompute one ticket's state from its timestamps
-- ---------------------------------------------------------------------------
create or replace function app.refresh_sla_state(p_ticket_id uuid)
returns public.sla_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sla      public.ticket_sla%rowtype;
  v_policy   public.sla_policies%rowtype;
  v_target   public.sla_policy_targets%rowtype;
  v_ticket   public.tickets%rowtype;
  v_state    public.sla_state;
begin
  select * into v_sla from public.ticket_sla where ticket_id = p_ticket_id for update;
  if not found then
    return null;
  end if;

  select * into v_policy from public.sla_policies where id = v_sla.policy_id;
  select * into v_ticket from public.tickets where id = p_ticket_id;
  select * into v_target from public.sla_policy_targets
  where policy_id = v_sla.policy_id and priority = v_ticket.priority;

  if v_sla.paused_at is not null then
    v_state := 'paused';
  elsif v_ticket.status in ('resolved', 'closed') then
    v_state := case when v_sla.first_response_breached or v_sla.resolution_breached
                    then 'breached' else 'completed' end;
  else
    if now() > v_sla.first_response_due_at and v_sla.first_response_met_at is null
       and not v_sla.first_response_breached then
      update public.ticket_sla set first_response_breached = true where ticket_id = p_ticket_id;
      v_sla.first_response_breached := true;
    end if;

    if now() > v_sla.resolution_due_at and not v_sla.resolution_breached then
      update public.ticket_sla set resolution_breached = true where ticket_id = p_ticket_id;
      v_sla.resolution_breached := true;
    end if;

    if v_sla.first_response_breached or v_sla.resolution_breached then
      v_state := 'breached';
    else
      v_state := case
        when now() >= v_sla.resolution_due_at
             - make_interval(mins => v_target.resolution_minutes * (100 - v_policy.warning_threshold_pct) / 100)
          then 'due_soon'
        else 'on_track'
      end;
    end if;
  end if;

  update public.ticket_sla set state = v_state where ticket_id = p_ticket_id;
  return v_state;
end;
$$;
