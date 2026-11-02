import { describe, expect, it } from 'vitest';

import {
  emailSchema,
  forgotPasswordSchema,
  passwordSchema,
  profileUpdateSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation';

describe('auth validation', () => {
  it('accepts a valid sign-up', () => {
    const result = signUpSchema.safeParse({
      fullName: 'Noura Al-Harbi',
      email: 'noura@example.com',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
      locale: 'ar',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords with a field-level message', () => {
    const result = signUpSchema.safeParse({
      fullName: 'Sara',
      email: 'sara@example.com',
      password: 'correct-horse-battery',
      confirmPassword: 'different-password',
      locale: 'en',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('confirmPassword'));
      expect(issue?.message).toBe('validation.passwordMismatch');
    }
  });

  it('rejects a short password', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('1234567890').success).toBe(true);
  });

  it('trims whitespace around names', () => {
    const result = signUpSchema.safeParse({
      fullName: '   Layla   ',
      email: 'layla@example.com',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
      locale: 'en',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fullName).toBe('Layla');
  });

  it('rejects an invalid email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 'a@b' }).success).toBe(false);
  });

  it('accepts common international phone formats and blank', () => {
    const base = { fullName: 'Ali', locale: 'en' as const };
    expect(profileUpdateSchema.safeParse({ ...base, phone: '+966 55 123 4567' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...base, phone: '' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...base, phone: undefined }).success).toBe(true);
  });

  it('rejects a phone containing letters', () => {
    const result = profileUpdateSchema.safeParse({
      fullName: 'Ali',
      phone: 'call-me',
      locale: 'en',
    });
    expect(result.success).toBe(false);
  });

  it('requires a password on sign-in but does not apply length rules', () => {
    // Length is enforced at sign-up; sign-in must not reject an old, shorter
    // password with a confusing "too short" message.
    expect(signInSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('accepts Arabic names', () => {
    const result = signUpSchema.safeParse({
      fullName: 'نورة الحربي',
      email: 'noura@example.com',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
      locale: 'ar',
    });
    expect(result.success).toBe(true);
  });
});