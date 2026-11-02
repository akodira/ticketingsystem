import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  /**
   * The locale is always present in the URL. English is the default, and a
   * visitor with no stored preference who prefers Arabic in the browser is
   * redirected to /ar by the locale detection in proxy.ts.
   */
  localePrefix: 'always',
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];