'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  grantRoleAction,
  setAccountStatusAction,
} from '@/modules/identity/services/user-admin.actions';
import type { UserAdminActionState } from '@/modules/identity/services/user-admin-types';

const initialState: UserAdminActionState = { ok: false };

/**
 * Per-user controls. Each submits a single-value form to a server action; the
 * server action re-checks permissions and the database re-checks the rules, so a
 * tampered form cannot do anything the menu does not already allow.
 */
export function UserRowActions({
  userId,
  roles,
  availableRoles,
  availableStatuses,
  locale,
}: {
  userId: string;
  roles: readonly string[];
  accountStatus: string;
  availableRoles: readonly string[];
  availableStatuses: readonly string[];
  locale: string;
}) {
  const t = useTranslations();
  const [roleState, roleAction, rolePending] = useActionState(grantRoleAction, initialState);
  const [statusState, statusAction, statusPending] = useActionState(
    setAccountStatusAction,
    initialState,
  );

  const message = roleState.message ?? statusState.message;
  const ok = roleState.ok || statusState.ok;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {availableRoles.map((role) => (
          <form key={role} action={roleAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="grant" value="true" />
            <Button type="submit" variant="secondary" size="sm" disabled={rolePending}>
              + {t(`roles.${role}`)}
            </Button>
          </form>
        ))}

        {roles.map((role) => (
          <form key={`remove-${role}`} action={roleAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="grant" value="false" />
            <Button type="submit" variant="ghost" size="sm" disabled={rolePending}>
              − {t(`roles.${role}`)}
            </Button>
          </form>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-content-muted">{t('users.statusLabel')}</span>
        {availableStatuses.map((status) => (
          <form key={status} action={statusAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="secondary" size="sm" disabled={statusPending}>
              {t(`users.status.${status}`)}
            </Button>
          </form>
        ))}
      </div>

      {message && (
        <p
          role={ok ? 'status' : 'alert'}
          className={ok ? 'text-xs text-success' : 'text-xs text-danger'}
        >
          {t(message)}
        </p>
      )}
    </div>
  );
}