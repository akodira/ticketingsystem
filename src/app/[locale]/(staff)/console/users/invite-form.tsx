'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { inviteStaffAction } from '@/modules/identity/services/user-admin.actions';
import type { UserAdminActionState } from '@/modules/identity/services/user-admin-types';

const initialState: UserAdminActionState = { ok: false };

export function InviteStaffForm({
  locale,
  roles,
}: {
  locale: string;
  roles: readonly string[];
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(inviteStaffAction, initialState);
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]!) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />

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
        label={t('users.invite.fullName')}
        autoComplete="off"
        required
        error={fieldError('fullName')}
      />
      <TextField
        name="email"
        type="email"
        label={t('common.email')}
        autoComplete="off"
        required
        error={fieldError('email')}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-role" className="text-sm font-medium">
          {t('users.invite.role')}
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="agent"
          className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </select>
        <p className="text-xs text-content-muted">{t('users.invite.roleHint')}</p>
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t('common.loading') : t('users.invite.submit')}
      </Button>
    </form>
  );
}