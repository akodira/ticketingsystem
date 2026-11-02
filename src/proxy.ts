import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { routing } from '@/i18n/routing';

/**
 * Next.js 16 `proxy` (formerly middleware).
 *
 * Responsibilities, in order:
 *   1. redirect unauthenticated visitors away from protected areas,
 *   2. resolve the locale and rewrite/redirect (next-intl).
 *
 * The session check here is deliberately coarse — it only looks for the Supabase
 * auth cookie. Real authorization (roles, team scope, RLS) happens server-side in
 * the layouts and services. This file must stay fast and must never touch the
 * database.
 */

const intlMiddleware = createMiddleware(routing);

const LOCALE_SEGMENT = /^\/(en|ar)(?=\/|$)/;

const PUBLIC_PATHS = new Set([
  '/',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/confirm',
]);

const PROTECTED_PREFIXES = ['/portal', '/console'];

/** Splits `/ar/console/tickets` into `{ locale: 'ar', rest: '/console/tickets' }`. */
export function splitLocale(pathname: string): { locale: string | null; rest: string } {
  const match = pathname.match(LOCALE_SEGMENT);
  if (!match) return { locale: null, rest: pathname || '/' };
  const locale = match[1] ?? null;
  const rest = pathname.slice(match[0].length);
  return { locale, rest: rest === '' ? '/' : rest };
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route handlers outside the locale tree (auth callback, health) must not be
  // rewritten by the locale middleware.
  if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  const { locale, rest } = splitLocale(pathname);
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => rest === prefix || rest.startsWith(`${prefix}/`),
  );
  const isPublic = PUBLIC_PATHS.has(rest);

  if (isProtected && !isPublic) {
    const hasSession = request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale ?? routing.defaultLocale}/sign-in`;
      url.search = '';
      url.searchParams.set('next', rest);
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals and any request with a file extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
