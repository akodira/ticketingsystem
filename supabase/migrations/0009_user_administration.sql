-- =============================================================================
-- 0009 — User administration
--
-- Staff are provisioned by an administrator, never by self-registration. These
-- RPCs are the only supported way to change a role, an account status or a team
-- membership, so the guards below cannot be bypassed by a crafted request:
--
--   * only an active administrator may call them,
--   * a user is either a customer or a staff member, never both,
--   * the last active administrator can never be removed, suspended or demoted,
--   * account status follows a fixed matrix,
--   * every change writes an audit row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Account status transitions
-- ---------------------------------------------------------------------------
create or replace function app.account_status_transition_allowed(
  p_from public.account_status,
  p_to   public.account_status
)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from (values
      ('pending'::public.account_status,     'active'::public.account_status),
      ('pending',                            'deactivated'),
      ('active',                             'suspended'),
      ('active',                             'deactivated'),
      ('suspended',                          'active'),
      ('suspended',                          'deactivated'),
      ('deactivated',                        'active')
    ) as m(from_status, to_status)
    where m.from_status = p_from and m.to_status = p_to
  );
$$;

comment on function app.account_status_transition_allowed is
  'Allowed account status changes. `active` is reached from pending by email confirmation and by '
  'an administrator reactivating a suspended or deactivated account.';

-- ---------------------------------------------------------------------------
-- Guard: an active administrator must always remain
-- ---------------------------------------------------------------------------
create or replace function app.assert_not_last_admin(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin  boolean;
  v_others    integer;
begin
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.code = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return;
  end if;

  select count(*) into v_others
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where r.code = 'admin'
    and ur.user_id <> p_user_id
    and p.account_status = 'active';

  if v_others = 0 then
    raise exception 'cannot remove the last active administrator'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.set_user_role
--
-- p_grant = true  → add the role
-- p_grant = false → remove the role
--
-- Internal roles and the customer role are mutually exclusive: granting a
-- staff role removes `customer`, and granting `customer` requires that no
-- internal role is held. Staff therefore can never raise tickets (D-09).
-- ---------------------------------------------------------------------------
create or replace function app.set_user_role(
  p_user_id uuid,
  p_role    public.role_code,
  p_grant   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_role_id    uuid;
  v_is_internal boolean;
  v_held_internal boolean;
  v_held_customer boolean;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform app.assert_permission('user.manage');

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  select id, is_internal into v_role_id, v_is_internal
  from public.roles where code = p_role;

  if v_role_id is null then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.is_internal
  ), exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.code = 'customer'
  ) into v_held_internal, v_held_customer;

  if p_grant then
    if v_is_internal and v_held_customer then
      raise exception 'staff and customer roles are mutually exclusive: remove the customer role first'
        using errcode = '23514';
    end if;

    if not v_is_internal and v_held_internal then
      raise exception 'staff and customer roles are mutually exclusive: remove the staff role first'
        using errcode = '23514';
    end if;

    insert into public.user_roles (user_id, role_id, granted_by)
    values (p_user_id, v_role_id, v_actor)
    on conflict (user_id, role_id) do nothing;
  else
    if p_role = 'admin' then
      perform app.assert_not_last_admin(p_user_id);
    end if;

    delete from public.user_roles where user_id = p_user_id and role_id = v_role_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (
    v_actor,
    case when p_grant then 'user.role_granted' else 'user.role_revoked' end,
    'profile',
    p_user_id,
    jsonb_build_object('role', p_role)
  );
end;
$$;

comment on function app.set_user_role is
  'Grants or revokes one role. Enforces staff/customer exclusivity and last-administrator protection.';

-- ---------------------------------------------------------------------------
-- app.set_account_status
-- ---------------------------------------------------------------------------
create or replace function app.set_account_status(
  p_user_id uuid,
  p_status  public.account_status
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth.uid();
  v_before public.account_status;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform app.assert_permission('user.manage');

  select account_status into v_before from public.profiles where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if v_before = p_status then
    return;
  end if;

  if not app.account_status_transition_allowed(v_before, p_status) then
    raise exception 'illegal account status change: % -> %', v_before, p_status
      using errcode = '23514';
  end if;

  if p_status <> 'active' then
    perform app.assert_not_last_admin(p_user_id);
  end if;

  update public.profiles set account_status = p_status where id = p_user_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (v_actor, 'user.status_changed', 'profile', p_user_id,
          jsonb_build_object('account_status', v_before),
          jsonb_build_object('account_status', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- app.set_team_membership
--
-- Administrators may manage any team. A team leader may add or remove members
-- of their own team but may not create another leader; only an administrator
-- can appoint a leader.
-- ---------------------------------------------------------------------------
create or replace function app.set_team_membership(
  p_team_id   uuid,
  p_user_id   uuid,
  p_team_role public.team_role default 'member',
  p_active    boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_is_admin    boolean := app.is_admin();
  v_is_leader   boolean := p_team_id = any (app.my_leader_team_ids());
  v_target_staff boolean;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not (v_is_admin or v_is_leader) then
    raise exception 'not permitted to manage this team' using errcode = '42501';
  end if;

  if not v_is_admin and p_team_role = 'leader' then
    raise exception 'only an administrator can appoint a team leader' using errcode = '42501';
  end if;

  select is_staff into v_target_staff from public.profiles where id = p_user_id;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if not v_target_staff then
    raise exception 'only staff accounts can join a support team' using errcode = '23514';
  end if;

  insert into public.team_members (team_id, user_id, team_role, is_active)
  values (p_team_id, p_user_id, p_team_role, p_active)
  on conflict (team_id, user_id) do update
    set team_role = excluded.team_role,
        is_active = excluded.is_active;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (v_actor, case when p_active then 'team.member_added' else 'team.member_removed' end,
          'team', p_team_id,
          jsonb_build_object('user_id', p_user_id, 'team_role', p_team_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- app.count_other_active_admins
--
-- Used by the console to explain a refusal before attempting it. SECURITY
-- DEFINER because counting across user_roles would otherwise require reading
-- other users' role rows.
-- ---------------------------------------------------------------------------
create or replace function app.count_other_active_admins(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (app.is_admin() or app.has_permission('user.read.all')) then
    raise exception 'permission denied: user.read.all' using errcode = '42501';
  end if;

  return (
    select count(*)::integer
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where r.code = 'admin'
      and ur.user_id <> p_user_id
      and p.account_status = 'active'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- app.list_users — administrator directory
--
-- Returns one row per user with role codes aggregated. Paged server-side; the
-- caller never receives an unbounded list.
-- ---------------------------------------------------------------------------
create or replace function app.list_users(
  p_search text default null,
  p_role   public.role_code default null,
  p_status public.account_status default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  user_id        uuid,
  email          text,
  full_name      text,
  account_status public.account_status,
  is_staff       boolean,
  roles          public.role_code[],
  team_count     integer,
  created_at     timestamptz,
  last_login_at  timestamptz,
  total_count    bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.assert_permission('user.read.all');

  return query
  with filtered as (
    select p.*,
           coalesce(
             (select array_agg(r.code order by r.code)
              from public.user_roles ur join public.roles r on r.id = ur.role_id
              where ur.user_id = p.id),
             '{}'::public.role_code[]
           ) as role_codes
    from public.profiles p
    where (p_search is null
           or p.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%')
      and (p_status is null or p.account_status = p_status)
  )
  select f.id,
         f.email::text,
         f.full_name,
         f.account_status,
         f.is_staff,
         f.role_codes,
         (select count(*)::integer from public.team_members tm
           where tm.user_id = f.id and tm.is_active),
         f.created_at,
         f.last_login_at,
         count(*) over ()
  from filtered f
  where p_role is null or p_role = any (f.role_codes)
  order by f.created_at desc
  limit least(coalesce(p_limit, 25), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function app.list_users is
  'Paged user directory for administrators. SECURITY DEFINER because it aggregates across '
  'user_roles; it asserts user.read.all itself.';

-- ---------------------------------------------------------------------------
-- Team directory for the console (staff-readable, no privileged data)
-- ---------------------------------------------------------------------------
create or replace function app.list_teams()
returns table (
  team_id       uuid,
  code          text,
  name_en       text,
  name_ar       text,
  department_en text,
  is_default    boolean,
  member_count  integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (app.is_staff() or app.is_admin()) then
    raise exception 'permission denied: staff only' using errcode = '42501';
  end if;

  return query
  select t.id,
         t.code::text,
         t.name_en,
         t.name_ar,
         d.name_en,
         t.is_default,
         (select count(*)::integer from public.team_members tm
           where tm.team_id = t.id and tm.is_active)
  from public.teams t
  join public.departments d on d.id = t.department_id
  where t.deleted_at is null
  order by t.is_default desc, t.name_en;
end;
$$;

comment on function app.list_teams is
  'Returns the team directory with member counts. Staff only.';

-- ---------------------------------------------------------------------------
-- Permissions: authenticated users may call; the function itself checks role
-- ---------------------------------------------------------------------------
grant execute on function app.list_users to authenticated;
grant execute on function app.set_user_role to authenticated;
grant execute on function app.set_user_account_status to authenticated;
grant execute on function app.set_team_membership to authenticated;
grant execute on function app.list_teams to authenticated;
grant execute on function app.count_other_active_admins to authenticated;
