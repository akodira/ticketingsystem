'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from '@/modules/identity/services/auth.actions';
import type { AuthActionState } from '@/modules/identity/services/auth-types';

const initialState: AuthActionState = { ok: false };

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, setState] = useState<AuthActionState>(initialState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await requestPasswordResetAction(initialState, formData);
      setState(result);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state.message && (
        <p role="status" className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-content">
          {t(state.message)}
        </p>
      )}

      <TextField
        name="email"
        type="email"
        label={t('common.email')}
        autoComplete="email"
        required
        error={state.fieldErrors?.email ? t(state.fieldErrors.email) : undefined}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t('common.loading') : t('auth.sendResetLink')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const [state, setState] = useState<AuthActionState>(initialState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updatePasswordAction(initialState, formData);
      setState(result);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state.message && (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(state.message)}
        </p>
      )}

      <TextField
        name="password"
        type="password"
        label={t('auth.newPassword')}
        autoComplete="new-password"
        required
        hint={t('auth.passwordHint')}
        error={state.fieldErrors?.password ? t(state.fieldErrors.password) : undefined}
      />
      <TextField
        name="confirmPassword"
        type="password"
        label={t('common.confirmPassword')}
        autoComplete="new-password"
        required
        error={
          state.fieldErrors?.confirmPassword ? t(state.fieldErrors.confirmPassword) : undefined
        }
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t('common.loading') : t('auth.updatePassword')}
      </Button>
    </form>
  );
}