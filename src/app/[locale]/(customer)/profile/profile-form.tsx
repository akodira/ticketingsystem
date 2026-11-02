'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { updateProfileAction, type ProfileActionState } from '@/modules/identity/services/profile.actions';

const initialState: ProfileActionState = { ok: false };

export function ProfileForm({
  locale,
  initial,
}: {
  locale: string;
  initial: { fullName: string; phone: string; locale: 'en' | 'ar' };
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);
  const fieldError = (name: string) => (state.fieldErrors?.[name] ? t(state.fieldErrors[name]!) : undefined);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4" noValidate>
      <input type="hidden" name="currentLocale" value={locale} />

      {state.message && (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={
            state.ok
              ? 'rounded-md border border-transparent bg-success-soft px-3 py-2 text-sm text-success'
              : 'rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger'
          }
        >
          {t(state.message)}
        </p>
      )}

      <TextField
        name="fullName"
        label={t('common.fullName')}
        defaultValue={initial.fullName}
        autoComplete="name"
        required
        error={fieldError('fullName')}
      />
      <TextField
        name="phone"
        label={t('common.phone')}
        defaultValue={initial.phone}
        autoComplete="tel"
        inputMode="tel"
        error={fieldError('phone')}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-locale" className="text-sm font-medium">
          {t('common.language')}
        </label>
        <select
          id="profile-locale"
          name="locale"
          defaultValue={initial.locale}
          className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
        >
          <option value="en">{t('common.english')}</option>
          <option value="ar">{t('common.arabic')}</option>
        </select>
      </div>

      <Button type="submit" disabled={pending} className="mt-2 self-start">
        {pending ? t('common.loading') : t('common.save')}
      </Button>
    </form>
  );
}