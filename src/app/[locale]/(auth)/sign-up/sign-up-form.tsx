'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { signUpAction } from '@/modules/identity/services/auth.actions';
import type { AuthActionState } from '@/modules/identity/services/auth-types';

const initialState: AuthActionState = { ok: false };

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const fieldError = (name: string) => (state.fieldErrors?.[name] ? t(state.fieldErrors[name]!) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state.message && (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(state.message)}
        </p>
      )}

      <TextField
        name="fullName"
        label={t('common.fullName')}
        autoComplete="name"
        required
        error={fieldError('fullName')}
      />
      <TextField
        name="email"
        type="email"
        label={t('common.email')}
        autoComplete="email"
        required
        error={fieldError('email')}
      />
      <TextField
        name="password"
        type="password"
        label={t('common.password')}
        autoComplete="new-password"
        required
        hint={t('auth.passwordHint')}
        error={fieldError('password')}
      />
      <TextField
        name="confirmPassword"
        type="password"
        label={t('common.confirmPassword')}
        autoComplete="new-password"
        required
        error={fieldError('confirmPassword')}
      />

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? t('common.loading') : t('common.signUp')}
      </Button>

      <p className="text-center text-sm text-content-muted">
        {t('auth.haveAccount')}{' '}
        <Link href="/sign-in" className="text-brand hover:underline">
          {t('common.signIn')}
        </Link>
      </p>
    </form>
  );
}