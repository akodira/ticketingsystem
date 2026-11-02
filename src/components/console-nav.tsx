'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * Console navigation. Items are filtered by role on the server and passed in, so
 * a viewer never sees a link to a page that would refuse them.
 */
export function ConsoleNav({
  items,
}: {
  items: readonly { href: string; labelKey: string }[];
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('console')} className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-sm',
              active
                ? 'bg-surface-raised font-medium text-content'
                : 'text-content-muted hover:bg-surface-raised hover:text-content',
            )}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}