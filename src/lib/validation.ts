import { z } from 'zod';

/**
 * Shared input schemas. Every trust boundary parses with one of these before a
 * service is called, and services re-validate anything that reaches a write.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .pipe(z.email({ message: 'validation.emailInvalid' }));

export const passwordSchema = z
  .string()
  .min(10, { message: 'validation.passwordShort' })
  .max(128);

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'validation.nameRequired' })
  .max(120);

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^\+?[0-9 ()-]{7,20}$/, { message: 'validation.required' })
  .optional()
  .or(z.literal(''));

export const localeSchema = z.enum(['en', 'ar']);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'validation.required' }),
});

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    locale: localeSchema.default('en'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export const profileUpdateSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  locale: localeSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Flattens a Zod error into `{ field: messageKey }` for form rendering.
 * The messages are translation keys, so the UI can localise them.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}