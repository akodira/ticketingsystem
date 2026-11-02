'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { resendVerificationAction } from '@/modules/identity/services/auth.actions';
import type { AuthActionState } from '@/modules/identity/services/auth-types';

const initialState: AuthActionState = { ok: false };

export function ResendVerificationForm({ email, locale }: { email: string; locale: string }) {
  const t = useTranslations();
  const [state, setState] = useState<AuthActionState>(initialState);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const formData = new FormData();
    formData.set('email', email);
    formData.set('locale', locale);
    startTransition(async () => {
      setState(await resendVerificationAction(initialState, formData));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {state.message && (
        <p role="status" className="text-sm text-success">
          {t(state.message)}
        </p>
      )}
      {state.fieldErrors?.email && (
        <p role="alert" className="text-sm text-danger">
          {t(state.fieldErrors.email)}
        </p>
      )}
      <Button type="button" variant="secondary" onClick={handleSubmit} disabled={pending}>
        {pending ? t('common.loading') : t('auth.resendVerification')}
      </Button>
    </div>
  );
}