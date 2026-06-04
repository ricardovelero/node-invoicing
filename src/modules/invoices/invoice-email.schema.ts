import { z } from "zod";

export const invoiceEmailFormSchema = z.object({
  toEmail: z
    .string()
    .trim()
    .min(1, "Enter a recipient email.")
    .email("Enter a valid recipient email."),
});

export type InvoiceEmailForm = z.infer<typeof invoiceEmailFormSchema>;
export type InvoiceEmailErrors = Partial<Record<keyof InvoiceEmailForm, string[]>>;
export type InvoiceEmailValues = Record<keyof InvoiceEmailForm, string>;

export const createInvoiceEmailValues = (
  values: Partial<InvoiceEmailValues> = {},
): InvoiceEmailValues => ({
  toEmail: values.toEmail ?? "",
});
