-- =============================================================================
-- Seed: reference data only. No demo tickets, no demo users.
-- Idempotent: safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
insert into public.roles (code, name_en, name_ar, is_internal) values
  ('customer',          'Customer',           'عميل',            false),
  ('agent',             'Support Agent',      'موظف دعم',        true),
  ('team_leader',       'Team Leader',        'قائد فريق',       true),
  ('admin',             'System Administrator','مدير النظام',    true),
  ('management_viewer', 'Management Viewer',  'مدير إداري',      true)
on conflict (code) do update
  set name_en = excluded.name_en,
      name_ar = excluded.name_ar,
      is_internal = excluded.is_internal;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('ticket.create.self',            'Create a ticket for oneself'),
  ('ticket.read.own',               'Read own tickets'),
  ('ticket.read.org',               'Read tickets of one''s organization'),
  ('ticket.read.team',              'Read tickets owned by one''s team'),
  ('ticket.read.all',               'Read every ticket'),
  ('ticket.reply.own',              'Reply publicly to one''s own ticket'),
  ('ticket.reply.team',             'Reply publicly to team tickets'),
  ('ticket.note.internal',          'Add private internal notes'),
  ('ticket.attachment.upload',      'Upload attachments to accessible tickets'),
  ('ticket.attachment.internal',    'Attach staff-only files'),
  ('ticket.assign.self',            'Take an unassigned ticket from one''s team'),
  ('ticket.assign.team',            'Assign tickets within one''s team'),
  ('ticket.assign.any',             'Assign tickets across teams'),
  ('ticket.escalate',               'Escalate a ticket'),
  ('ticket.priority.change.team',   'Change priority on team tickets'),
  ('ticket.priority.change.any',    'Change priority system-wide'),
  ('ticket.status.transition.team', 'Change status on team tickets'),
  ('ticket.status.transition.any',  'Change status system-wide'),
  ('ticket.resolve',                'Resolve a ticket'),
  ('ticket.close.any',              'Close a ticket without customer confirmation'),
  ('ticket.reopen.any',             'Reopen any ticket'),
  ('ticket.reopen.own',             'Reopen one''s own ticket'),
  ('ticket.bulk.team',              'Bulk actions on team tickets'),
  ('ticket.export.team',            'Export team tickets'),
  ('feedback.submit.own',           'Confirm, reject or rate one''s own resolutions'),
  ('team.read.team',                'View team details and workload'),
  ('team.read.all',                 'View all teams'),
  ('team.manage.team',              'Maintain membership of one''s team'),
  ('team.manage.all',               'Manage teams and departments'),
  ('user.read.team',                'View staff in one''s team'),
  ('user.read.all',                 'View all users'),
  ('user.manage',                   'Create users and grant roles'),
  ('customer.read.team',            'View customers of team tickets'),
  ('customer.read.all',             'View all customer records'),
  ('customer.manage',               'Edit customer records'),
  ('category.manage',               'Manage ticket categories'),
  ('customfield.manage',            'Manage custom fields'),
  ('sla.read',                      'Read SLA configuration and compliance'),
  ('sla.manage',                    'Configure SLA policies and calendars'),
  ('kb.read.internal',              'Read internal knowledgebase articles'),
  ('kb.manage',                     'Manage knowledgebase content'),
  ('feedback.read.team',            'Read team CSAT'),
  ('feedback.read.all',             'Read all CSAT'),
  ('report.view.team',              'View team dashboards and reports'),
  ('report.view.all',               'View company-wide reports'),
  ('report.export',                 'Export reports'),
  ('settings.manage',               'Manage system settings'),
  ('audit.read',                    'Read audit logs'),
  ('notification.read.own',         'Read own notifications'),
  ('notification.manage',           'Manage the notification delivery queue')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Role → permission grants (mirrors docs/ROLES_AND_PERMISSIONS.md §3)
-- ---------------------------------------------------------------------------
with grants(role_code, permission_code) as (
  values
    -- Customer
    ('customer', 'ticket.create.self'),
    ('customer', 'ticket.read.own'),
    ('customer', 'ticket.read.org'),
    ('customer', 'ticket.reply.own'),
    ('customer', 'ticket.attachment.upload'),
    ('customer', 'ticket.reopen.own'),
    ('customer', 'feedback.submit.own'),
    ('customer', 'notification.read.own'),
    -- Agent
    ('agent', 'ticket.read.team'),
    ('agent', 'ticket.reply.team'),
    ('agent', 'ticket.note.internal'),
    ('agent', 'ticket.attachment.upload'),
    ('agent', 'ticket.attachment.internal'),
    ('agent', 'ticket.assign.self'),
    ('agent', 'ticket.priority.change.team'),
    ('agent', 'ticket.status.transition.team'),
    ('agent', 'ticket.resolve'),
    ('agent', 'team.read.team'),
    ('agent', 'user.read.team'),
    ('agent', 'customer.read.team'),
    ('agent', 'sla.read'),
    ('agent', 'kb.read.internal'),
    ('agent', 'report.view.team'),
    ('agent', 'notification.read.own'),
    -- Team leader
    ('team_leader', 'ticket.read.team'),
    ('team_leader', 'ticket.reply.team'),
    ('team_leader', 'ticket.note.internal'),
    ('team_leader', 'ticket.attachment.upload'),
    ('team_leader', 'ticket.attachment.internal'),
    ('team_leader', 'ticket.assign.self'),
    ('team_leader', 'ticket.assign.team'),
    ('team_leader', 'ticket.escalate'),
    ('team_leader', 'ticket.priority.change.team'),
    ('team_leader', 'ticket.status.transition.team'),
    ('team_leader', 'ticket.resolve'),
    ('team_leader', 'ticket.bulk.team'),
    ('team_leader', 'ticket.export.team'),
    ('team_leader', 'team.read.team'),
    ('team_leader', 'team.manage.team'),
    ('team_leader', 'user.read.team'),
    ('team_leader', 'customer.read.team'),
    ('team_leader', 'sla.read'),
    ('team_leader', 'kb.read.internal'),
    ('team_leader', 'feedback.read.team'),
    ('team_leader', 'report.view.team'),
    ('team_leader', 'report.export'),
    ('team_leader', 'notification.read.own'),
    -- Admin
    ('admin', 'ticket.read.team'),
    ('admin', 'ticket.read.all'),
    ('admin', 'ticket.reply.team'),
    ('admin', 'ticket.note.internal'),
    ('admin', 'ticket.attachment.upload'),
    ('admin', 'ticket.attachment.internal'),
    ('admin', 'ticket.assign.self'),
    ('admin', 'ticket.assign.team'),
    ('admin', 'ticket.assign.any'),
    ('admin', 'ticket.escalate'),
    ('admin', 'ticket.priority.change.team'),
    ('admin', 'ticket.priority.change.any'),
    ('admin', 'ticket.status.transition.team'),
    ('admin', 'ticket.status.transition.any'),
    ('admin', 'ticket.resolve'),
    ('admin', 'ticket.close.any'),
    ('admin', 'ticket.reopen.any'),
    ('admin', 'ticket.bulk.team'),
    ('admin', 'ticket.export.team'),
    ('admin', 'team.read.team'),
    ('admin', 'team.read.all'),
    ('admin', 'team.manage.team'),
    ('admin', 'team.manage.all'),
    ('admin', 'user.read.team'),
    ('admin', 'user.read.all'),
    ('admin', 'user.manage'),
    ('admin', 'customer.read.team'),
    ('admin', 'customer.read.all'),
    ('admin', 'customer.manage'),
    ('admin', 'category.manage'),
    ('admin', 'customfield.manage'),
    ('admin', 'sla.read'),
    ('admin', 'sla.manage'),
    ('admin', 'kb.read.internal'),
    ('admin', 'kb.manage'),
    ('admin', 'feedback.read.team'),
    ('admin', 'feedback.read.all'),
    ('admin', 'report.view.team'),
    ('admin', 'report.view.all'),
    ('admin', 'report.export'),
    ('admin', 'settings.manage'),
    ('admin', 'audit.read'),
    ('admin', 'notification.read.own'),
    ('admin', 'notification.manage'),
    -- Management viewer (read-only — no write permission of any kind)
    ('management_viewer', 'ticket.read.all'),
    ('management_viewer', 'team.read.team'),
    ('management_viewer', 'team.read.all'),
    ('management_viewer', 'user.read.all'),
    ('management_viewer', 'customer.read.all'),
    ('management_viewer', 'sla.read'),
    ('management_viewer', 'feedback.read.all'),
    ('management_viewer', 'report.view.team'),
    ('management_viewer', 'report.view.all'),
    ('management_viewer', 'report.export'),
    ('management_viewer', 'notification.read.own')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.code = g.role_code::public.role_code
join public.permissions p on p.code = g.permission_code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Business calendar: Sunday–Thursday, 08:00–17:00, Asia/Riyadh
-- ---------------------------------------------------------------------------
insert into public.business_calendars (code, name_en, name_ar, timezone)
values ('ksa_default', 'Standard Support Calendar', 'تقويم الدعم الافتراضي', 'Asia/Riyadh')
on conflict (code) do nothing;

insert into public.business_hours (calendar_id, day_of_week, start_time, end_time)
select c.id, d, '08:00'::time, '17:00'::time
from public.business_calendars c
cross join (values (0), (1), (2), (3), (4)) as days(d)   -- Sunday..Thursday
where c.code = 'ksa_default'
  and not exists (
    select 1 from public.business_hours bh
    where bh.calendar_id = c.id and bh.day_of_week = d
  );

-- ---------------------------------------------------------------------------
-- Default SLA policy
-- Targets are PROVISIONAL pending business approval — see docs/OPEN_DECISIONS.md D-01.
-- ---------------------------------------------------------------------------
insert into public.sla_policies (
  code, name_en, name_ar, calendar_id, is_default,
  pause_on_pending_customer, pause_on_pending_internal,
  warning_threshold_pct, escalate_at_pct
)
select 'default', 'Default Policy', 'السياسة الافتراضية', c.id, true, true, false, 80, 100
from public.business_calendars c
where c.code = 'ksa_default'
on conflict (code) do nothing;

insert into public.sla_policy_targets (policy_id, priority, first_response_minutes, resolution_minutes)
select p.id, v.priority, v.first_response, v.resolution
from public.sla_policies p
cross join (values
  ('critical'::public.priority_level,  15, 240),
  ('high'::public.priority_level,      60, 480),
  ('normal'::public.priority_level,   240, 1440),
  ('low'::public.priority_level,      480, 2880)
) as v(priority, first_response, resolution)
where p.code = 'default'
on conflict (policy_id, priority) do nothing;

-- ---------------------------------------------------------------------------
-- Default department and team (fallback routing target)
-- ---------------------------------------------------------------------------
insert into public.departments (name_en, name_ar)
select 'Customer Support', 'دعم العملاء'
where not exists (select 1 from public.departments where name_en = 'Customer Support');

insert into public.teams (department_id, code, name_en, name_ar, is_default)
select d.id, 'general', 'General Support', 'الدعم العام', true
from public.departments d
where d.name_en = 'Customer Support'
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Ticket categories
-- ---------------------------------------------------------------------------
insert into public.ticket_categories (code, name_en, name_ar, sort_order)
values
  ('technical',  'Technical Issue',   'مشكلة تقنية',      10),
  ('billing',    'Billing & Payments','الفواتير والمدفوعات', 20),
  ('account',    'Account Access',    'الوصول إلى الحساب', 30),
  ('request',    'Service Request',   'طلب خدمة',         40),
  ('other',      'Other',             'أخرى',            100)
on conflict (code) do nothing;

insert into public.ticket_categories (parent_id, code, name_en, name_ar, sort_order)
select p.id, v.code, v.name_en, v.name_ar, v.sort_order
from public.ticket_categories p
join (values
  ('technical', 'technical.bug',      'Bug or Error',       'خطأ أو خلل',        10),
  ('technical', 'technical.performance','Performance Issue','مشكلة في الأداء',  20),
  ('billing',   'billing.invoice',    'Invoice Question',   'استفسار عن فاتورة', 10),
  ('billing',   'billing.payment',    'Payment Failure',    'فشل في الدفع',      20),
  ('account',   'account.password',   'Password Reset',     'استعادة كلمة المرور', 10),
  ('account',   'account.locked',     'Account Locked',     'حساب مقفل',         20)
) as v(parent_code, code, name_en, name_ar, sort_order) on p.code = v.parent_code
where p.parent_id is null
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Knowledgebase categories
-- ---------------------------------------------------------------------------
insert into public.kb_categories (slug, name_en, name_ar, sort_order) values
  ('getting-started', 'Getting Started',  'البدء',            10),
  ('account',         'Account & Access', 'الحساب والوصول',   20),
  ('billing',         'Billing',          'الفواتير',         30),
  ('troubleshooting', 'Troubleshooting',  'استكشاف الأخطاء',  40)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('allow_customer_priority',      'true'::jsonb,  'Whether customers may choose ticket priority'),
  ('auto_close_days',              '7'::jsonb,     'Days after resolution before auto-close'),
  ('reopen_window_days',           '30'::jsonb,    'Window in which a closed ticket may be reopened'),
  ('max_reopens',                  '3'::jsonb,     'Maximum reopens per ticket'),
  ('attachment_max_bytes',         '10485760'::jsonb, 'Maximum attachment size in bytes'),
  ('attachment_max_per_message',   '5'::jsonb,     'Maximum attachments per message'),
  ('attachment_allowed_extensions',
     '["pdf","png","jpg","jpeg","gif","webp","docx","xlsx","pptx","txt","csv","zip"]'::jsonb,
     'Allowed attachment extensions'),
  ('sla_warning_threshold_pct',    '80'::jsonb,    'Default warning threshold'),
  ('default_timezone',             '"Asia/Riyadh"'::jsonb, 'Default display time zone'),
  ('sla_cron_interval_minutes',    '5'::jsonb,     'SLA sweep cadence'),
  ('kb_suggestions_enabled',       'true'::jsonb,  'Show knowledgebase suggestions during creation'),
  ('kb_suggestion_min_rank',       '0.1'::jsonb,   'Relevance cut-off for suggestions'),
  ('email_from_name',              '"Customer Support"'::jsonb, 'Outbound sender name'),
  ('email_from_address',           '"no-reply@example.com"'::jsonb, 'Outbound sender address')
on conflict (key) do nothing;
