import { z } from 'zod';

export const passwordRequirementsMessage =
  'Use at least 8 characters with uppercase, lowercase and a number.';

const stringInput = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (typeof value === 'string' ? value : ''), schema);

const passwordInput = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z
    .string()
    .min(1, 'Enter your password.')
    .superRefine((password, ctx) => {
      if (!password) {
        return;
      }

      const isStrong =
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password);

      if (!isStrong) {
        ctx.addIssue({
          code: 'custom',
          message: passwordRequirementsMessage,
        });
      }
    }),
);

const emailInput = stringInput(
  z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .email('Enter a valid email address.')
    .transform((email) => email.toLowerCase()),
);

export const registerValuesSchema = z.object({
  name: stringInput(z.string().trim()),
  email: stringInput(
    z
      .string()
      .trim()
      .transform((email) => email.toLowerCase()),
  ),
  organizationName: stringInput(z.string().trim()),
});

export const registerSchema = registerValuesSchema.extend({
  email: emailInput,
  password: passwordInput,
  organizationName: stringInput(
    z.string().trim().min(1, 'Enter your organization name.'),
  ),
});

export const forgotPasswordSchema = z.object({
  email: emailInput,
});

export const forgotPasswordValuesSchema = z.object({
  email: stringInput(
    z
      .string()
      .trim()
      .transform((email) => email.toLowerCase()),
  ),
});

export const resetPasswordSchema = z.object({
  password: passwordInput,
});

export const loginSchema = z.object({
  email: emailInput,
  password: stringInput(z.string().min(1, 'Enter your password.')),
});

export const loginValuesSchema = z.object({
  email: stringInput(
    z
      .string()
      .trim()
      .transform((email) => email.toLowerCase()),
  ),
});

export type RegisterValues = z.infer<typeof registerValuesSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type RegisterErrors = Partial<Record<keyof RegisterForm, string[]>>;
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordValuesSchema>;
export type ForgotPasswordErrors = Partial<Record<keyof ForgotPasswordForm, string[]>>;
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordErrors = Partial<Record<keyof ResetPasswordForm, string[]>>;
export type LoginForm = z.infer<typeof loginSchema>;
export type LoginValues = z.infer<typeof loginValuesSchema>;
export type LoginErrors = Partial<Record<keyof LoginForm, string[]>>;
