/**
 * Form state shared by the auth server actions and their client forms.
 *
 * Kept in its own module because a `'use server'` file may only export async
 * functions, so the state type cannot live beside them.
 */
export type AuthActionState = {
  ok: boolean;
  /** Translation key, never a raw message. */
  message?: string;
  /** Field name → translation key. */
  fieldErrors?: Record<string, string>;
};

export const emptyAuthState: AuthActionState = { ok: false };