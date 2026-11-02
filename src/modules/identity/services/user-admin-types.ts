/**
 * Shared shape for user-administration action results.
 * Kept outside the `'use server'` module because only async functions may be
 * exported from a server-action file.
 */
export type UserAdminActionState = {
  ok: boolean;
  /** Translation key, never a raw message. */
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const emptyUserAdminState: UserAdminActionState = { ok: false };