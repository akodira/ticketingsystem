'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth/session';
import { logger, describeError } from '@/lib/logger';
import { profileUpdateSchema, fieldErrors } from '@/lib/validation';

export type ProfileActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Customer self-service profile update.
 *
 * Only three columns are written. Role, account status and email are excluded
 * here and additionally blocked by trg_profiles_guard in the database, so the
 * rule does not depend on this code being correct.
 */
export async function updateProfileAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getSessionUser();
  const currentLocale = String(formData.get('currentLocale') ?? 'en');

  if (!user) {
    redirect(`/${currentLocale}/sign-in`);
  }

  if (user.isStaff) {
    return { ok: false, message: 'errors.unauthorized' };
  }

  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone === '' ? null : (parsed.data.phone ?? null),
      locale: parsed.data.locale,
    })
    .eq('id', user.id);

  if (error) {
    logger.error('profile.update_failed', { userId: user.id, error: describeError(error) });
    return { ok: false, message: 'errors.generic' };
  }

  logger.info('profile.updated', { userId: user.id });

  revalidatePath(`/${currentLocale}/profile`);
  revalidatePath(`/${currentLocale}/portal`);

  return { ok: true, message: 'portal.saved' };
}