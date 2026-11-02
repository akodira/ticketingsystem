'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * Language switch. It replaces the locale segment and keeps the rest of the
 * path, so a user reading a deep link stays on the same screen.
 *
 * Implemented as two links (not a select) so it works without JavaScript
 * enabled and is reachable by keyboard on every layout.
 */
export function LocaleSwitcher({ currentLocale }: { currentLocale: string }) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();

  const target = currentLocale === 'ar' ? 'en' : 'ar';
  const label = target === 'ar' ? t('arabic') : t('english');

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: target })}
      className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm text-content-muted hover:bg-surface-raised hover:text-content"
      lang={target}
      dir={target === 'ar' ? 'rtl' : 'ltr'}
      aria-label={`${t('toggleLanguage')}: ${label}`}
    >
      {label}
    </button>
  );
}