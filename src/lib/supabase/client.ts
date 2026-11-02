'use client';

import { createBrowserClient } from '@supabase/ssr';

import { requireClientEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Browser client. Uses the anon key, so every query it makes is subject to RLS.
 * Never import the admin client into a client component — see lib/supabase/admin.ts.
 */
export function createClient() {
  const env = requireClientEnv();
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
