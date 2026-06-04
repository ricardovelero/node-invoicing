import { z } from "zod";
import { supportedCurrencies } from "../settings/settings.schema";

export { supportedCurrencies };

export const itemFormSchema = z.object({
  name: z.string().trim().min(2, "Item name is required."),
  description: z.string().trim().max(2000, "Description must be 2,000 characters or fewer.").default(""),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative."),
  currency: z.enum(supportedCurrencies, { error: "Choose a supported currency." }),
  taxRate: z.coerce
    .number()
    .nonnegative("Tax rate cannot be negative.")
    .max(100, "Tax rate cannot exceed 100%."),
});

export type ItemForm = z.infer<typeof itemFormSchema>;

export type ItemFormValues = {
  name: string;
  description: string;
  unitPrice: string;
  currency: string;
  taxRate: string;
};

export type ItemFormErrors = Partial<Record<keyof ItemForm, string[]>>;

const stringValue = (value: unknown, fallback = "") => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
};

export const createItemFormValues = (
  values: Partial<ItemFormValues> = {},
): ItemFormValues => ({
  name: values.name ?? "",
  description: values.description ?? "",
  unitPrice: values.unitPrice ?? "0",
  currency: values.currency ?? "EUR",
  taxRate: values.taxRate ?? "0",
});

export const normalizeItemFormValues = (
  form: Record<string, unknown>,
): ItemFormValues => ({
  name: stringValue(form.name),
  description: stringValue(form.description),
  unitPrice: stringValue(form.unitPrice, "0"),
  currency: stringValue(form.currency, "EUR"),
  taxRate: stringValue(form.taxRate, "0"),
});

export const formatItemFormErrors = (
  error: z.ZodError<ItemForm>,
): ItemFormErrors => error.flatten().fieldErrors;
