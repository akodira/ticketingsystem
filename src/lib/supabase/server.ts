import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { requireClientEnv } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Server client bound to the request's cookies. Every query runs as the signed-in
 * user, so RLS applies. Use this for all user-facing reads and writes.
 */
export async function createSupabaseServerClient() {
  const env = requireClientEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render: cookies are read-only there.
          // Session refresh happens in proxy.ts, so this is safe to ignore.
        }
      },
    },
  });
}
