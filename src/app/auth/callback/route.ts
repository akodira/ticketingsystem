import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { routing } from '@/i18n/routing';
import { getClientEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Auth callback.
 *
 * Supabase redirects here after email confirmation and password recovery with a
 * `code` (PKCE) or `token_hash`. The code is exchanged for a session, the
 * cookies are written on the response, and the user is sent to `next` — which is
 * validated as a local path so this endpoint cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const rawNext = url.searchParams.get('next') ?? '/portal';
  const localeParam = url.searchParams.get('locale') ?? url.searchParams.get('lang');
  const locale =
    localeParam && routing.locales.includes(localeParam as (typeof routing.locales)[number])
      ? localeParam
      : routing.defaultLocale;

  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/portal';

  const env = getClientEnv();
  if (!env) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in?reason=config`, url.origin));
  }

  let response = NextResponse.redirect(new URL(`/${locale}${safeNext}`, url.origin));

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.redirect(new URL(`/${locale}${safeNext}`, url.origin));
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/${locale}/sign-in?reason=expired`, url.origin));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email' | 'email_change' | 'invite',
    });
    if (error) {
      return NextResponse.redirect(new URL(`/${locale}/sign-in?reason=expired`, url.origin));
    }
  } else {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, url.origin));
  }

  return response;
}