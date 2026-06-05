import { z } from 'zod';

export const passwordRequirementsMessage =
  'Use at least 8 characters with uppercase, lowercase and a number.';

const stringInput = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (typeof value === 'string' ? value : ''), schema);

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
  email: stringInput(
    z
      .string()
      .trim()
      .min(1, 'Enter your email address.')
      .email('Enter a valid email address.')
      .transform((email) => email.toLowerCase()),
  ),
  password: z.preprocess(
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
  ),
  organizationName: stringInput(
    z.string().trim().min(1, 'Enter your organization name.'),
  ),
});

export type RegisterValues = z.infer<typeof registerValuesSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type RegisterErrors = Partial<Record<keyof RegisterForm, string[]>>;
