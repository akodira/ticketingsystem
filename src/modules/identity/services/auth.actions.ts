'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { routing } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { logger, describeError } from '@/lib/logger';
import {
  signInSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  fieldErrors,
} from '@/lib/validation';
import type { AuthActionState } from './auth-types';

function localeFromForm(formData: FormData): 'en' | 'ar' {
  const raw = String(formData.get('locale') ?? routing.defaultLocale);
  return raw === 'ar' ? 'ar' : 'en';
}

async function baseUrl(): Promise<string> {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

/** Maps Supabase auth errors to translation keys. Never surfaces raw messages. */
function authErrorKey(message: string | undefined): string {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login credentials')) return 'errors.invalidCredentials';
  if (text.includes('email not confirmed')) return 'errors.emailNotConfirmed';
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'errors.emailInUse';
  }
  if (text.includes('rate limit') || text.includes('too many')) return 'errors.rateLimited';
  return 'errors.generic';
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = localeFromForm(formData);
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    logger.warn('auth.sign_in_failed', { code: error.code ?? 'unknown' });
    return { ok: false, message: authErrorKey(error.message) };
  }

  const next = String(formData.get('next') ?? '');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : null;

  const user = await getSessionUser();

  if (!user) {
    return { ok: false, message: 'errors.generic' };
  }

  if (user.profile.account_status === 'suspended' || user.profile.account_status === 'deactivated') {
    await supabase.auth.signOut();
    return { ok: false, message: 'errors.accountSuspended' };
  }

  logger.info('auth.signed_in', { userId: user.id, isStaff: user.isStaff });

  if (safeNext) {
    redirect(`/${locale}${safeNext}`);
  }

  redirect(`/${locale}${user.isStaff ? '/console' : '/portal'}`);
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = localeFromForm(formData);
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale,
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = await baseUrl();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?locale=${locale}`,
      data: { full_name: parsed.data.fullName, locale },
    },
  });

  if (error) {
    logger.warn('auth.sign_up_failed', { code: error.code ?? 'unknown' });
    return { ok: false, message: authErrorKey(error.message) };
  }

  logger.info('auth.signed_up');
  redirect(`/${locale}/sign-up/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = localeFromForm(formData);
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = await baseUrl();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password&locale=${locale}`,
  });

  // Always the same response â€” never disclose whether an account exists.
  return { ok: true, message: 'auth.verificationSent' };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = localeFromForm(formData);
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    logger.warn('auth.password_update_failed', { code: error.code ?? 'unknown' });
    return { ok: false, message: authErrorKey(error.message) };
  }

  logger.info('auth.password_updated');
  redirect(`/${locale}/portal`);
}

export async function resendVerificationAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '');
  const locale = localeFromForm(formData);
  const parsed = forgotPasswordSchema.safeParse({ email });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = await baseUrl();

  try {
    await supabase.auth.resend({
      type: 'signup',
      email: parsed.data.email,
      options: { emailRedirectTo: `${appUrl}/auth/callback?locale=${locale}` },
    });
  } catch (error) {
    logger.error('auth.resend_failed', { error: describeError(error) });
  }

  return { ok: true, message: 'auth.verificationSent' };
}

/** Signs the user out and returns them to the sign-in screen in their language. */
export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeFromForm(formData);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.warn('auth.sign_out_failed', { code: error.code ?? 'unknown' });
  }

  redirect(`/${locale}/sign-in`);
}

