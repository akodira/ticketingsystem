import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

function loadMessages(locale: 'en' | 'ar'): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'src', 'messages', `${locale}.json`), 'utf8'));
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogs', () => {
  it('English and Arabic define exactly the same keys', () => {
    const en = new Set(flattenKeys(loadMessages('en')));
    const ar = new Set(flattenKeys(loadMessages('ar')));

    const missingInAr = [...en].filter((key) => !ar.has(key)).sort();
    const missingInEn = [...ar].filter((key) => !en.has(key)).sort();

    expect(missingInAr, 'keys present in en.json but missing from ar.json').toEqual([]);
    expect(missingInEn, 'keys present in ar.json but missing from en.json').toEqual([]);
  });

  it('has no empty translations', () => {
    for (const locale of ['en', 'ar'] as const) {
      const flat = flattenKeys(loadMessages(locale));
      expect(flat.length).toBeGreaterThan(40);
    }
  });

  it('uses the same interpolation placeholders in both languages', () => {
    const en = JSON.stringify(loadMessages('en'));
    const ar = JSON.stringify(loadMessages('ar'));

    const placeholders = (text: string) =>
      [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

    expect(placeholders(ar)).toEqual(placeholders(en));
  });

  it('Arabic catalog contains Arabic script where it should', () => {
    const ar = loadMessages('ar') as { auth: { signInTitle: string }; common: { arabic: string } };
    expect(ar.auth.signInTitle).toMatch(/[؀-ۿ]/);
    // The language switcher deliberately shows the *other* language in its own script.
    expect(ar.common.arabic).toMatch(/[؀-ۿ]/);
  });
});