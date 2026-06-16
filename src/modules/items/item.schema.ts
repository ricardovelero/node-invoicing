import { z } from "zod";
import { defaultCurrency, supportedCurrencies } from "../../lib/currencies";

export const itemFormSchema = z.object({
  name: z.string().trim().min(2, "Item name is required."),
  description: z
    .string()
    .trim()
    .min(2, "Description is required.")
    .max(2000, "Description must be 2,000 characters or fewer."),
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

const asQueryRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  return typeof value === "string" ? value : "";
};

const integerQueryValue = (value: unknown, fallback: number) => {
  const rawValue = firstQueryValue(value).trim();

  if (!/^\d+$/.test(rawValue)) {
    return fallback;
  }

  const parsed = Number(rawValue);

  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

export const itemListLimits = [10, 20, 50] as const;
export type ItemListLimit = (typeof itemListLimits)[number];

export const itemListSortableColumns = [
  "name",
  "unitPriceCents",
  "taxRateBps",
  "createdAt",
] as const;
export type ItemListSort = (typeof itemListSortableColumns)[number];
export type ItemListDirection = "asc" | "desc";
export type ItemListArchiveFilter = "active" | "archived";

const sortableColumns = new Set<string>(itemListSortableColumns);

const normalizeItemLimit = (value: unknown): ItemListLimit => {
  const limit = integerQueryValue(value, 20);

  return itemListLimits.includes(limit as ItemListLimit)
    ? (limit as ItemListLimit)
    : 20;
};

const normalizeItemSort = (value: unknown): ItemListSort => {
  const sort = firstQueryValue(value);

  return sortableColumns.has(sort) ? (sort as ItemListSort) : "createdAt";
};

const normalizeItemDirection = (value: unknown): ItemListDirection =>
  firstQueryValue(value).toLowerCase() === "asc" ? "asc" : "desc";

const normalizeArchivedFilter = (value: unknown): ItemListArchiveFilter => {
  const archived = firstQueryValue(value).trim().toLowerCase();

  return archived === "1" || archived === "archived" ? "archived" : "active";
};

export const itemListQuerySchema = z.preprocess((value) => {
  const query = asQueryRecord(value);
  const page = Math.max(integerQueryValue(query.page, 1), 1);

  return {
    page,
    limit: normalizeItemLimit(query.limit),
    q: firstQueryValue(query.q).trim(),
    archived: normalizeArchivedFilter(query.archived),
    sort: normalizeItemSort(query.sort),
    direction: normalizeItemDirection(query.direction),
  };
}, z.object({
  page: z.number().int().min(1),
  limit: z.union([z.literal(10), z.literal(20), z.literal(50)]),
  q: z.string(),
  archived: z.enum(["active", "archived"]),
  sort: z.enum(itemListSortableColumns),
  direction: z.enum(["asc", "desc"]),
}));

export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

export const createItemFormValues = (
  values: Partial<ItemFormValues> = {},
): ItemFormValues => ({
  name: values.name ?? "",
  description: values.description ?? "",
  unitPrice: values.unitPrice ?? "0",
  currency: values.currency ?? defaultCurrency,
  taxRate: values.taxRate ?? "0",
});

export const normalizeItemFormValues = (
  form: Record<string, unknown>,
): ItemFormValues => ({
  name: stringValue(form.name),
  description: stringValue(form.description),
  unitPrice: stringValue(form.unitPrice, "0"),
  currency: stringValue(form.currency, defaultCurrency),
  taxRate: stringValue(form.taxRate, "0"),
});

export const formatItemFormErrors = (
  error: z.ZodError<ItemForm>,
): ItemFormErrors => error.flatten().fieldErrors;
