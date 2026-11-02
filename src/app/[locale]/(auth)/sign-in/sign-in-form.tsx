'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { signInAction } from '@/modules/identity/services/auth.actions';
import type { AuthActionState } from '@/modules/identity/services/auth-types';

const initialState: AuthActionState = { ok: false };

export function SignInForm({ locale, nextPath }: { locale: string; nextPath?: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const fieldError = (name: string) => (state.fieldErrors?.[name] ? t(state.fieldErrors[name]!) : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      {state.message && (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(state.message)}
        </p>
      )}

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
        autoComplete="current-password"
        required
        error={fieldError('password')}
      />

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? t('common.loading') : t('common.signIn')}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-brand hover:underline">
          {t('auth.forgotLink')}
        </Link>
        <span className="text-content-muted">
          {t('auth.noAccount')}{' '}
          <Link href="/sign-up" className="text-brand hover:underline">
            {t('common.signUp')}
          </Link>
        </span>
      </div>
    </form>
  );
}