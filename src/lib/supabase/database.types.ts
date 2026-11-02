/**
 * Database types.
 *
 * Produced by Supabase from the applied migrations:
 *
 *   npm run db:types
 *
 * The file is committed so type checking and the build work before a database is
 * reachable. Regenerate it after adding a table rather than editing by hand.
 * The shape follows the generator's output (Row / Insert / Update /
 * Relationships per table) because supabase-js infers query results from it.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'pending_customer'
  | 'pending_internal'
  | 'resolved'
  | 'closed'
  | 'reopened';

export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low';

export type RoleCode = 'customer' | 'agent' | 'team_leader' | 'admin' | 'management_viewer';

export type AccountStatus = 'pending' | 'active' | 'suspended' | 'deactivated';

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        email: string;
        full_name: string;
        phone: string | null;
        locale: string;
        timezone: string;
        avatar_url: string | null;
        account_status: AccountStatus;
        is_staff: boolean;
        email_verified_at: string | null;
        last_login_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      customers: Table<{
        profile_id: string;
        organization_id: string | null;
        job_title: string | null;
        company_name: string | null;
        preferred_contact: 'email' | 'phone';
        notes_internal: string | null;
        registered_at: string;
        updated_at: string;
      }>;
      roles: Table<{
        id: string;
        code: RoleCode;
        name_en: string;
        name_ar: string;
        is_internal: boolean;
        created_at: string;
      }>;
      user_roles: Table<{
        user_id: string;
        role_id: string;
        granted_by: string | null;
        granted_at: string;
      }>;
      team_members: Table<{
        team_id: string;
        user_id: string;
        team_role: 'member' | 'leader';
        is_active: boolean;
        joined_at: string;
      }>;
      teams: Table<{
        id: string;
        department_id: string;
        code: string;
        name_en: string;
        name_ar: string;
        description: string | null;
        email: string | null;
        is_default: boolean;
        is_active: boolean;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>;
      ticket_categories: Table<{
        id: string;
        parent_id: string | null;
        code: string;
        name_en: string;
        name_ar: string;
        description_en: string | null;
        description_ar: string | null;
        default_team_id: string | null;
        default_priority: PriorityLevel | null;
        sla_policy_id: string | null;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>;
      tickets: Table<{
        id: string;
        reference: string;
        customer_id: string;
        organization_id: string | null;
        category_id: string;
        subcategory_id: string | null;
        subject: string;
        description: string;
        status: TicketStatus;
        priority: PriorityLevel;
        channel: 'web_portal';
        team_id: string | null;
        assignee_id: string | null;
        locale: 'en' | 'ar';
        source_ip: string | null;
        first_response_at: string | null;
        last_public_reply_at: string | null;
        last_customer_reply_at: string | null;
        resolved_at: string | null;
        resolution_summary: string | null;
        closed_at: string | null;
        reopened_count: number;
        escalation_level: number;
        created_at: string;
        updated_at: string;
      }>;
      ticket_messages: Table<{
        id: string;
        ticket_id: string;
        author_id: string;
        author_kind: 'customer' | 'agent' | 'system';
        visibility: 'public' | 'internal';
        body: string;
        body_locale: string | null;
        is_initial_description: boolean;
        created_at: string;
        edited_at: string | null;
      }>;
      ticket_attachments: Table<{
        id: string;
        ticket_id: string;
        message_id: string | null;
        uploader_id: string;
        visibility: 'public' | 'internal';
        storage_path: string;
        file_name: string;
        mime_type: string;
        size_bytes: number;
        checksum_sha256: string | null;
        created_at: string;
      }>;
      ticket_status_history: Table<{
        id: string;
        ticket_id: string;
        from_status: TicketStatus | null;
        to_status: TicketStatus;
        changed_by: string | null;
        reason: string | null;
        created_at: string;
      }>;
      ticket_sla: Table<{
        ticket_id: string;
        policy_id: string;
        first_response_due_at: string;
        resolution_due_at: string;
        first_response_met_at: string | null;
        resolution_met_at: string | null;
        first_response_breached: boolean;
        resolution_breached: boolean;
        state: 'on_track' | 'due_soon' | 'breached' | 'paused' | 'completed';
        paused_at: string | null;
        total_paused_seconds: number;
        warning_sent_at: string | null;
        breach_notified_at: string | null;
        updated_at: string;
      }>;
      notifications: Table<{
        id: string;
        user_id: string;
        ticket_id: string | null;
        event: string;
        title_en: string;
        title_ar: string;
        body_en: string;
        body_ar: string;
        link_url: string | null;
        read_at: string | null;
        created_at: string;
      }>;
      app_settings: Table<{
        key: string;
        value: Json;
        description: string | null;
        updated_by: string | null;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      create_ticket: {
        Args: {
          p_category_id: string;
          p_subcategory_id: string | null;
          p_subject: string;
          p_description: string;
          p_priority: PriorityLevel;
          p_custom_values?: Json;
          p_source_ip?: string | null;
        };
        Returns: { id: string; reference: string }[];
      };
      add_message: {
        Args: {
          p_ticket_id: string;
          p_body: string;
          p_visibility?: 'public' | 'internal';
        };
        Returns: { message_id: string; new_status: TicketStatus }[];
      };
      transition_ticket: {
        Args: {
          p_ticket_id: string;
          p_to: TicketStatus;
          p_reason?: string | null;
          p_resolution_summary?: string | null;
        };
        Returns: TicketStatus;
      };
      assign_ticket: {
        Args: {
          p_ticket_id: string;
          p_team_id: string | null;
          p_assignee_id: string | null;
          p_type?: 'initial' | 'reassign' | 'escalate' | 'unassign' | 'auto';
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      set_user_role: {
        Args: { p_user_id: string; p_role: RoleCode; p_grant: boolean };
        Returns: undefined;
      };
      set_account_status: {
        Args: { p_user_id: string; p_status: AccountStatus };
        Returns: undefined;
      };
      set_team_membership: {
        Args: {
          p_team_id: string;
          p_user_id: string;
          p_team_role?: 'member' | 'leader';
          p_active?: boolean;
        };
        Returns: undefined;
      };
      list_users: {
        Args: {
          p_search?: string | null;
          p_role?: RoleCode | null;
          p_status?: AccountStatus | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          user_id: string;
          email: string;
          full_name: string;
          account_status: AccountStatus;
          is_staff: boolean;
          roles: RoleCode[];
          team_count: number;
          created_at: string;
          last_login_at: string | null;
          total_count: number;
        }[];
      };
      list_teams: {
        Args: Record<string, never>;
        Returns: {
          team_id: string;
          code: string;
          name_en: string;
          name_ar: string;
          department_en: string;
          is_default: boolean;
          member_count: number;
        }[];
      };
      count_other_active_admins: {
        Args: { p_user_id: string };
        Returns: number;
      };
    };
    Enums: {
      ticket_status: TicketStatus;
      priority_level: PriorityLevel;
      role_code: RoleCode;
      account_status: AccountStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Ticket = Database['public']['Tables']['tickets']['Row'];
export type TicketMessage = Database['public']['Tables']['ticket_messages']['Row'];