import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Liveness/readiness probe.
 *
 * Returns 200 only when the application is configured and the database answers
 * a trivial query. It never exposes configuration values.
 */
export async function GET() {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return NextResponse.json(
      { status: 'unconfigured', database: 'unavailable' },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('roles').select('code', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ok', database: 'reachable' });
}