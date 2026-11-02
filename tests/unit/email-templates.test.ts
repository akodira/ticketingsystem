import { describe, expect, it } from 'vitest';

import { renderEmail } from '@/lib/email/templates';

describe('email templates', () => {
  it('renders the welcome template in both languages', () => {
    const en = renderEmail('customer.welcome', 'en', {
      name: 'Noura',
      confirmUrl: 'https://example.com/auth/callback?code=abc',
    });
    const ar = renderEmail('customer.welcome', 'ar', {
      name: 'نورة',
      confirmUrl: 'https://example.com/auth/callback?code=abc',
    });

    expect(en.subject).not.toMatch(/[؀-ۿ]/);
    expect(ar.subject).toMatch(/[؀-ۿ]/);
    expect(en.html).toContain('dir="ltr"');
    expect(ar.html).toContain('dir="rtl"');
    expect(en.html).toContain('https://example.com/auth/callback?code=abc');
    expect(ar.text).toContain('نورة');
  });

  it('escapes HTML in user-supplied values', () => {
    const rendered = renderEmail('customer.welcome', 'en', {
      name: '<script>alert(1)</script>',
      confirmUrl: 'https://example.com',
    });
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('escapes the URL attribute as well', () => {
    const rendered = renderEmail('customer.welcome', 'en', {
      name: 'A',
      confirmUrl: 'https://example.com/?a="><script>',
    });
    expect(rendered.html).not.toContain('"><script>');
  });

  it('renders the password reset template', () => {
    const rendered = renderEmail('customer.password_reset', 'ar', {
      resetUrl: 'https://example.com/reset',
    });
    expect(rendered.text).toContain('https://example.com/reset');
    expect(rendered.html).toContain('dir="rtl"');
  });

  it('falls back to a neutral greeting when a name is missing', () => {
    const rendered = renderEmail('customer.welcome', 'en', { confirmUrl: 'https://example.com' });
    expect(rendered.text).toContain('there');
  });
});