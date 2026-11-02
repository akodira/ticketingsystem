-- =============================================================================
-- 0007 — Authorization helpers, Row Level Security, views, RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Scope helpers. These are the only place data scope is expressed in SQL;
-- src/modules/identity/domain/scope.ts mirrors them and a parity test asserts
-- the truth tables agree.
-- ---------------------------------------------------------------------------
create or replace function app.current_roles()
returns public.role_code[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(r.code), '{}'::public.role_code[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;

create or replace function app.has_role(p_role public.role_code)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = p_role
  );
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.has_role('admin');
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.is_internal
  );
$$;

create or replace function app.is_read_only_viewer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.has_role('management_viewer') and not app.is_admin()
     and not app.has_role('team_leader') and not app.has_role('agent');
$$;

create or replace function app.my_team_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(tm.team_id), '{}'::uuid[])
  from public.team_members tm
  where tm.user_id = auth.uid() and tm.is_active;
$$;

create or replace function app.my_leader_team_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(tm.team_id), '{}'::uuid[])
  from public.team_members tm
  where tm.user_id = auth.uid() and tm.is_active and tm.team_role = 'leader';
$$;

create or replace function app.org_shares_tickets(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select o.share_tickets from public.organizations o
      where o.id = p_org_id and o.is_active and o.deleted_at is null),
    false
  );
$$;

-- Read scope: own | org | team | all
create or replace function app.can_read_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id = p_ticket_id
      and (
        t.customer_id = auth.uid()
        or (t.organization_id is not null
            and app.org_shares_tickets(t.organization_id)
            and exists (select 1 from public.customers c
                        where c.profile_id = auth.uid()
                          and c.organization_id = t.organization_id))
        or (app.is_staff() and t.team_id = any (app.my_team_ids()))
        or app.is_admin()
        or (app.is_read_only_viewer())
      )
  );
$$;

-- Write scope: may reply / transition / assign
create or replace function app.can_write_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id = p_ticket_id
      and (
        t.customer_id = auth.uid()
        or (app.is_staff()
            and t.team_id = any (app.my_team_ids())
            and not app.is_read_only_viewer())
        or app.is_admin()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Deny by default: no policy below = no access.
-- ---------------------------------------------------------------------------
alter table public.roles                   enable row level security;
alter table public.permissions             enable row level security;
alter table public.role_permissions        enable row level security;
alter table public.user_roles              enable row level security;
alter table public.organizations           enable row level security;
alter table public.profiles                enable row level security;
alter table public.customers               enable row level security;
alter table public.departments             enable row level security;
alter table public.teams                   enable row level security;
alter table public.team_members            enable row level security;
alter table public.ticket_categories       enable row level security;
alter table public.custom_fields           enable row level security;
alter table public.category_custom_fields  enable row level security;
alter table public.app_settings            enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.business_calendars      enable row level security;
alter table public.business_hours          enable row level security;
alter table public.holidays                enable row level security;
alter table public.sla_policies            enable row level security;
alter table public.sla_policy_targets      enable row level security;
alter table public.tickets                 enable row level security;
alter table public.ticket_messages         enable row level security;
alter table public.ticket_attachments      enable row level security;
alter table public.ticket_assignments      enable row level security;
alter table public.ticket_status_history   enable row level security;
alter table public.ticket_custom_values    enable row level security;
alter table public.ticket_sla              enable row level security;
alter table public.customer_feedback       enable row level security;
alter table public.kb_categories           enable row level security;
alter table public.kb_articles             enable row level security;
alter table public.kb_category_links       enable row level security;
alter table public.kb_article_feedback     enable row level security;
alter table public.notifications           enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.rate_limits             enable row level security;
alter table public.job_runs                enable row level security;
alter table public.ticket_sequences        enable row level security;

alter table public.tickets      enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_attachments enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data: readable by any authenticated user
-- ---------------------------------------------------------------------------
create policy roles_select on public.roles
  for select to authenticated using (true);

create policy permissions_select on public.permissions
  for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

create policy role_permissions_admin on public.role_permissions
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or app.is_admin() or app.is_staff());

create policy user_roles_admin on public.user_roles
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.is_admin()
    or (app.is_staff() and exists (
          select 1 from public.team_members tm
          where tm.user_id = profiles.id and tm.team_id = any (app.my_team_ids())
        ))
    or (app.is_staff() and exists (
          select 1 from public.tickets t
          where t.customer_id = profiles.id and t.team_id = any (app.my_team_ids())
        ))
    or app.is_read_only_viewer()
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (
    profile_id = auth.uid()
    or app.is_admin()
    or (app.is_staff() and exists (
          select 1 from public.tickets t
          where t.customer_id = customers.profile_id and t.team_id = any (app.my_team_ids())
        ))
    or (app.is_staff() and exists (
          select 1 from public.team_members tm
          where tm.user_id = customers.profile_id and tm.team_id = any (app.my_team_ids())
        ))
  );

create policy customers_update_self on public.customers
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy customers_admin on public.customers
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    app.is_admin()
    or exists (select 1 from public.customers c
               where c.profile_id = auth.uid() and c.organization_id = organizations.id)
  );

create policy organizations_admin on public.organizations
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Teams and departments
-- ---------------------------------------------------------------------------
create policy departments_select on public.departments
  for select to authenticated using (app.is_staff());

create policy departments_admin on public.departments
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy teams_select on public.teams
  for select to authenticated using (app.is_staff());

create policy teams_admin on public.teams
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy team_members_select on public.team_members
  for select to authenticated
  using (app.is_admin() or app.is_staff());

create policy team_members_leader on public.team_members
  for all to authenticated
  using (team_id = any (app.my_leader_team_ids()) or app.is_admin())
  with check (team_id = any (app.my_leader_team_ids()) or app.is_admin());

-- ---------------------------------------------------------------------------
-- Categories and custom fields (reference data, active rows only)
-- ---------------------------------------------------------------------------
create policy ticket_categories_select on public.ticket_categories
  for select to authenticated
  using ((is_active and deleted_at is null) or app.is_staff());

create policy ticket_categories_admin on public.ticket_categories
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy custom_fields_select on public.custom_fields
  for select to authenticated
  using ((is_active and deleted_at is null) or app.is_staff());

create policy custom_fields_admin on public.custom_fields
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy category_custom_fields_select on public.category_custom_fields
  for select to authenticated using (true);

create policy category_custom_fields_admin on public.category_custom_fields
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Settings and audit
-- ---------------------------------------------------------------------------
create policy app_settings_select on public.app_settings
  for select to authenticated using (app.is_staff());

create policy app_settings_admin on public.app_settings
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy audit_logs_select on public.audit_logs
  for select to authenticated using (app.is_admin());

-- No insert/update/delete policy: only security-definer code writes audit rows.

-- ---------------------------------------------------------------------------
-- SLA configuration
-- ---------------------------------------------------------------------------
create policy business_calendars_select on public.business_calendars
  for select to authenticated using (app.is_staff());

create policy business_calendars_admin on public.business_calendars
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy business_hours_select on public.business_hours
  for select to authenticated using (app.is_staff());

create policy business_hours_admin on public.business_hours
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy holidays_select on public.holidays
  for select to authenticated using (app.is_staff());

create policy holidays_admin on public.holidays
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy sla_policies_select on public.sla_policies
  for select to authenticated using (app.is_staff());

create policy sla_policies_admin on public.sla_policies
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy sla_policy_targets_select on public.sla_policy_targets
  for select to authenticated using (app.is_staff());

create policy sla_policy_targets_admin on public.sla_policy_targets
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create policy tickets_select on public.tickets
  for select to authenticated
  using (app.can_read_ticket(id));

create policy tickets_insert_customer on public.tickets
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_status = 'active'
    )
  );

create policy tickets_update_scoped on public.tickets
  for update to authenticated
  using (app.can_write_ticket(id) and not app.is_read_only_viewer())
  with check (app.can_write_ticket(id) and not app.is_read_only_viewer());

-- ---------------------------------------------------------------------------
-- Conversation: internal notes are never visible to non-staff
-- ---------------------------------------------------------------------------
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated
  using (
    app.can_read_ticket(ticket_id)
    and (app.is_staff() or visibility = 'public')
  );

create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (app.is_staff() and app.can_write_ticket(ticket_id) and not app.is_read_only_viewer())
      or (
        not app.is_staff()
        and visibility = 'public'
        and author_kind = 'customer'
        and exists (
          select 1 from public.tickets t
          where t.id = ticket_id and t.customer_id = auth.uid()
        )
      )
    )
  );

create policy ticket_attachments_select on public.ticket_attachments
  for select to authenticated
  using (
    app.can_read_ticket(ticket_id)
    and (app.is_staff() or visibility = 'public')
  );

create policy ticket_attachments_insert on public.ticket_attachments
  for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and app.can_write_ticket(ticket_id)
    and (app.is_staff() or visibility = 'public')
  );

-- ---------------------------------------------------------------------------
-- Assignments, history, custom values, SLA state
-- ---------------------------------------------------------------------------
create policy ticket_assignments_select on public.ticket_assignments
  for select to authenticated
  using (app.can_read_ticket(ticket_id) and (app.is_staff() or app.is_admin()));

create policy ticket_status_history_select on public.ticket_status_history
  for select to authenticated
  using (app.can_read_ticket(ticket_id));

create policy ticket_custom_values_select on public.ticket_custom_values
  for select to authenticated
  using (
    app.can_read_ticket(ticket_id)
    and (
      app.is_staff()
      or exists (
        select 1 from public.custom_fields f
        where f.id = ticket_custom_values.field_id
      )
    )
  );

-- Customers read only the summary columns; pause internals stay staff-only.
create policy ticket_sla_select_staff on public.ticket_sla
  for select to authenticated
  using (app.is_staff() and app.can_read_ticket(ticket_id));

create policy ticket_sla_select_customer on public.ticket_sla
  for select to authenticated
  using (
    not app.is_staff()
    and exists (select 1 from public.tickets t
                where t.id = ticket_sla.ticket_id and t.customer_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create policy customer_feedback_select on public.customer_feedback
  for select to authenticated
  using (
    customer_id = auth.uid()
    or app.is_admin()
    or (app.is_staff() and app.can_read_ticket(ticket_id))
  );

create policy customer_feedback_insert on public.customer_feedback
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and t.customer_id = auth.uid()
        and t.status in ('resolved', 'closed')
    )
  );

-- ---------------------------------------------------------------------------
-- Knowledgebase
-- ---------------------------------------------------------------------------
create policy kb_categories_select on public.kb_categories
  for select to authenticated
  using (
    app.is_staff()
    or (is_active and deleted_at is null and exists (
          select 1 from public.kb_articles a
          where a.category_id = kb_categories.id and a.status = 'published'
            and a.visibility = 'public' and a.deleted_at is null))
  );

create policy kb_categories_admin on public.kb_categories
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy kb_articles_select on public.kb_articles
  for select to authenticated
  using (
    app.is_admin()
    or (app.is_staff() and (visibility = 'public' or app.has_role('agent')
                            or app.has_role('team_leader') or app.is_admin()))
    or (visibility = 'public' and status = 'published' and deleted_at is null)
  );

create policy kb_articles_manage on public.kb_articles
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy kb_category_links_select on public.kb_category_links
  for select to authenticated using (true);

create policy kb_category_links_manage on public.kb_category_links
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy kb_article_feedback_select on public.kb_article_feedback
  for select to authenticated using (user_id = auth.uid() or app.is_staff());

create policy kb_article_feedback_insert on public.kb_article_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

create policy kb_article_feedback_update on public.kb_article_feedback
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_deliveries_select on public.notification_deliveries
  for select to authenticated using (app.is_admin());

create policy job_runs_select on public.job_runs
  for select to authenticated using (app.is_admin());
