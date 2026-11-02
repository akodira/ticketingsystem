import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getClientEnv, getServerEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Privileged client. It bypasses RLS, so every function that uses it must apply
 * its own authorization rule. This module imports `server-only`, which makes any
 * attempt to bundle it for the browser a build error rather than a leak.
 *
 * Legitimate uses (all in src/modules/*\/services/*.system.ts or /api/cron):
 *   - background sweeps with no signed-in user
 *   - writing an outbox row in a transaction the user cannot complete alone
 *   - reading the delivery queue for retries
 */
export function createSupabaseAdminClient() {
  const env = getClientEnv();
  const server = getServerEnv();

  if (!env || !server.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role client requested but SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, server.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
