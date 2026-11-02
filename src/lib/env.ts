import { z } from 'zod';

/**
 * Environment access is centralised so that a missing variable fails loudly at
 * startup rather than producing a runtime error deep inside a request.
 *
 * `serverEnv` must never be imported from a client component. Variables without
 * the NEXT_PUBLIC_ prefix are stripped from client bundles by Next.js, and the
 * `server-only` guard in lib/supabase/admin.ts prevents accidental leakage of
 * the privileged client.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  APP_BASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function readClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid public environment configuration — ${details}`);
  }

  return parsed.data;
}

/**
 * Returns the public configuration, or null when it is not configured.
 * Pages use the null case to render a setup notice instead of crashing, which
 * keeps a fresh clone runnable before Supabase credentials exist.
 */
export function getClientEnv(): ClientEnv | null {
  try {
    return readClientEnv();
  } catch {
    return null;
  }
}

export function requireClientEnv(): ClientEnv {
  return readClientEnv();
}

export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    APP_BASE_URL: process.env.APP_BASE_URL,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment configuration — ${details}`);
  }

  return parsed.data;
}

export function isSupabaseConfigured(): boolean {
  return getClientEnv() !== null;
}
