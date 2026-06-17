import { z } from "zod";
import type { InvoiceStatus, PaymentStatus } from "@prisma/client";
import {
  amountToCents,
  calculateDiscountCents,
  lineTotalCents,
  type DiscountType,
} from "../../lib/money";
import { defaultCurrency, supportedCurrencies } from "../../lib/currencies";
import {
  customRateType,
  resolveWithholdingRateType,
} from "../../lib/withholding";

export const dueDateBeforeIssueDateMessage = "Due date cannot be before the issue date.";
export const paidAtRequiredMessage = "Enter a paid date.";
export const paidAtInvalidMessage = "Enter a valid paid date.";
export const paymentAmountRequiredMessage = "Enter a payment amount.";
export const paymentAmountPositiveMessage = "Payment amount must be greater than zero.";
export const paymentAmountInvalidMessage = "Enter a valid payment amount.";

const asFormRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined) {
    return [];
  }

  return [value];
};

const stringValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : value === undefined ? fallback : String(value);

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

export const invoiceListLimits = [10, 20, 50] as const;
export type InvoiceListLimit = (typeof invoiceListLimits)[number];

export const invoiceListSortableColumns = [
  "number",
  "issueDate",
  "dueDate",
  "status",
  "totalCents",
  "createdAt",
] as const;
export type InvoiceListSort = (typeof invoiceListSortableColumns)[number];
export type InvoiceListDirection = "asc" | "desc";

export const invoiceListStatusOptions = [
  "DRAFT",
  "ISSUED",
  "VOID",
] as const satisfies readonly InvoiceStatus[];

export const invoiceListPaymentStatusOptions = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const satisfies readonly PaymentStatus[];

const statusQueryValues = new Map(
  invoiceListStatusOptions.map((status) => [status.toLowerCase(), status]),
);
const paymentStatusQueryValues = new Map(
  invoiceListPaymentStatusOptions.map((status) => [
    status.toLowerCase(),
    status,
  ]),
);
const sortableColumns = new Set<string>(invoiceListSortableColumns);

const normalizeInvoiceStatusFilter = (value: unknown) =>
  statusQueryValues.get(firstQueryValue(value).trim().toLowerCase());

const normalizeInvoicePaymentStatusFilter = (value: unknown) =>
  paymentStatusQueryValues.get(firstQueryValue(value).trim().toLowerCase());

const normalizeInvoiceOverdueFilter = (value: unknown) => {
  const queryValue = firstQueryValue(value).trim().toLowerCase();

  return queryValue === "overdue" || queryValue === "true";
};

const normalizeInvoiceSort = (value: unknown): InvoiceListSort => {
  const sort = firstQueryValue(value);

  return sortableColumns.has(sort) ? (sort as InvoiceListSort) : "createdAt";
};

const normalizeInvoiceDirection = (value: unknown): InvoiceListDirection =>
  firstQueryValue(value).toLowerCase() === "asc" ? "asc" : "desc";

const normalizeInvoiceLimit = (value: unknown): InvoiceListLimit => {
  const limit = integerQueryValue(value, 20);

  return invoiceListLimits.includes(limit as InvoiceListLimit)
    ? (limit as InvoiceListLimit)
    : 20;
};

export const invoiceListQuerySchema = z.preprocess((value) => {
  const form = asFormRecord(value);
  const page = Math.max(integerQueryValue(form.page, 1), 1);

  return {
    page,
    limit: normalizeInvoiceLimit(form.limit),
    q: firstQueryValue(form.q).trim(),
    status: normalizeInvoiceStatusFilter(form.status),
    paymentStatus: normalizeInvoicePaymentStatusFilter(form.paymentStatus),
    overdue: normalizeInvoiceOverdueFilter(form.overdue),
    sort: normalizeInvoiceSort(form.sort),
    direction: normalizeInvoiceDirection(form.direction),
  };
}, z.object({
  page: z.number().int().min(1),
  limit: z.union([z.literal(10), z.literal(20), z.literal(50)]),
  q: z.string(),
  status: z.enum(invoiceListStatusOptions).optional(),
  paymentStatus: z.enum(invoiceListPaymentStatusOptions).optional(),
  overdue: z.boolean(),
  sort: z.enum(invoiceListSortableColumns),
  direction: z.enum(["asc", "desc"]),
}));

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

const dateInput = (requiredMessage: string, invalidMessage: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, requiredMessage).pipe(z.coerce.date({ error: invalidMessage })),
  );

const discountTypeSchema = z.enum(["amount", "percent"]);
// The rate-type token is country-driven (the standard rates vary), so accept the
// custom sentinel or any positive numeric label. The superRefine below enforces
// that a non-custom token matches the submitted rate.
const withholdingRateTypeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().refine(
    (value) =>
      value === customRateType ||
      (Number.isFinite(Number(value)) && Number(value) > 0),
    "Choose a supported withholding rate.",
  ),
);

const discountValueSchema = z.coerce.number().nonnegative("Discount cannot be negative.");
const unitPriceSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value.trim();
    }

    return value === undefined || value === null ? "" : String(value);
  },
  z.string()
    .min(1, "Enter a unit price.")
    .transform((value, ctx) => {
      const amount = Number(value);

      if (!Number.isFinite(amount)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid unit price.",
        });
        return z.NEVER;
      }

      return amount;
    })
    .refine((amount) => amount >= 0, "Unit price cannot be negative."),
);
const statusActionSchema = z.enum(["issue", "void"], {
  error: "Choose a valid invoice status action.",
});

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Line description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: unitPriceSchema,
  discountType: discountTypeSchema.default("amount"),
  discountValue: discountValueSchema.default(0),
  taxRate: z.coerce
    .number()
    .nonnegative("Tax rate cannot be negative.")
    .max(100, "Tax rate cannot exceed 100%.")
    .default(0),
})
  .superRefine((line, ctx) => {
    if (line.discountType === "percent" && line.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Discount cannot exceed 100%.",
      });
    }

    const subtotalCents = lineTotalCents(line.quantity, amountToCents(line.unitPrice));

    if (line.discountType === "amount" && amountToCents(line.discountValue) > subtotalCents) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Line discount cannot exceed the line subtotal.",
      });
    }
  });

const normalizeLineInputs = (form: Record<string, unknown>) => {
  const descriptions = toArray(form.lineDescription);
  const quantities = toArray(form.quantity);
  const unitPrices = toArray(form.unitPrice);
  const discountTypes = toArray(form.lineDiscountType);
  const discountValues = toArray(form.lineDiscountValue);
  const taxRates = toArray(form.taxRate);
  const length = Math.max(
    descriptions.length,
    quantities.length,
    unitPrices.length,
    discountTypes.length,
    discountValues.length,
    taxRates.length,
  );

  return Array.from({ length }, (_, index) => ({
    description: descriptions[index],
    quantity: quantities[index],
    unitPrice: unitPrices[index],
    discountType: discountTypes[index],
    discountValue: discountValues[index],
    taxRate: taxRates[index],
  }));
};

export const createInvoiceFormSchema = (options: {
  withholdingAllowed?: boolean;
} = {}) => z.preprocess((value) => {
  const form = asFormRecord(value);
  const applyWithholding =
    options.withholdingAllowed === true &&
    (form.applyWithholding === "on" ||
      form.applyWithholding === "true" ||
      form.applyWithholding === true);

  return {
    customerId: form.customerId,
    currency: form.currency,
    issueDate: form.issueDate,
    dueDate: form.dueDate,
    invoiceDiscountType: form.invoiceDiscountType,
    invoiceDiscountValue: form.invoiceDiscountValue,
    applyWithholding,
    withholdingType: applyWithholding ? form.withholdingType : undefined,
    withholdingRateType: applyWithholding ? form.withholdingRateType : undefined,
    withholdingRate: applyWithholding ? form.withholdingRate : undefined,
    paymentInstructions: form.paymentInstructions,
    notes: form.notes,
    lines: normalizeLineInputs(form),
  };
}, z
  .object({
    customerId: z.string().uuid("Choose a customer."),
    currency: z.enum(supportedCurrencies, { error: "Choose a supported currency." }),
    issueDate: dateInput("Enter an issue date.", "Enter a valid issue date."),
    dueDate: dateInput("Enter a due date.", "Enter a valid due date."),
    invoiceDiscountType: discountTypeSchema.default("amount"),
    invoiceDiscountValue: discountValueSchema.default(0),
    applyWithholding: z.boolean().default(false),
    withholdingType: z.enum(["IRPF"]).optional(),
    withholdingRateType: withholdingRateTypeSchema.default(customRateType),
    withholdingRate: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value === undefined ? "" : String(value)),
      z.string()
        .transform((value, ctx) => {
          if (value === "") {
            return null;
          }

          const rate = Number(value);

          if (!Number.isFinite(rate)) {
            ctx.addIssue({
              code: "custom",
              message: "Enter a valid withholding rate.",
            });
            return z.NEVER;
          }

          return rate;
        })
        .refine((rate) => rate === null || rate > 0, "Withholding rate must be greater than zero."),
    ).default(null),
    paymentInstructions: z
      .string()
      .trim()
      .max(2000, "Payment instructions must be 2,000 characters or fewer.")
      .default(""),
    notes: z.string().trim().max(2000, "Notes must be 2,000 characters or fewer.").default(""),
    lines: z.array(lineItemSchema).min(1, "Add at least one line item."),
  })
  .superRefine((invoice, ctx) => {
    if (invoice.dueDate < invoice.issueDate) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: dueDateBeforeIssueDateMessage,
      });
    }

    if (invoice.applyWithholding) {
      if (invoice.withholdingType !== "IRPF") {
        ctx.addIssue({
          code: "custom",
          path: ["withholdingType"],
          message: "Choose a supported withholding type.",
        });
      }

      if (invoice.withholdingRate === null) {
        ctx.addIssue({
          code: "custom",
          path: ["withholdingRate"],
          message: "Enter a withholding rate.",
        });
      }

      if (
        invoice.withholdingRateType !== "custom" &&
        invoice.withholdingRate !== Number(invoice.withholdingRateType)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["withholdingRate"],
          message: "Choose the selected withholding rate or use custom.",
        });
      }
    }

    if (invoice.invoiceDiscountType === "percent" && invoice.invoiceDiscountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["invoiceDiscountValue"],
        message: "Discount cannot exceed 100%.",
      });
    }

    const subtotalAfterLineDiscountsCents = invoice.lines.reduce((total, line) => {
      const subtotalCents = lineTotalCents(line.quantity, amountToCents(line.unitPrice));
      const discountCents = calculateDiscountCents(subtotalCents, {
        type: line.discountType,
        value: line.discountValue,
      });

      return total + subtotalCents - discountCents;
    }, 0);

    if (
      invoice.invoiceDiscountType === "amount" &&
      amountToCents(invoice.invoiceDiscountValue) > subtotalAfterLineDiscountsCents
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["invoiceDiscountValue"],
        message: "Invoice discount cannot exceed the subtotal after line discounts.",
      });
    }
  })
  .transform((invoice) => ({
    ...invoice,
    withholdingType: invoice.applyWithholding ? "IRPF" as const : undefined,
    withholdingRate: invoice.applyWithholding ? invoice.withholdingRate : null,
  })));

export const invoiceFormSchema = createInvoiceFormSchema({
  withholdingAllowed: true,
});

type ParsedInvoiceForm = z.infer<typeof invoiceFormSchema>;
export type InvoiceForm = Omit<
  ParsedInvoiceForm,
  'applyWithholding' | 'withholdingType' | 'withholdingRateType' | 'withholdingRate'
> &
  Partial<
    Pick<
      ParsedInvoiceForm,
      'applyWithholding' | 'withholdingType' | 'withholdingRateType' | 'withholdingRate'
    >
  >;
export type InvoiceLineForm = InvoiceForm["lines"][number];

export const invoiceStatusActionSchema = z.preprocess((value) => {
  const form = asFormRecord(value);

  return {
    action: form.action,
  };
}, z
  .object({
    action: statusActionSchema,
  })
  .transform((value) => ({
    action: value.action,
  })));

export type InvoiceStatusActionForm = z.infer<typeof invoiceStatusActionSchema>;

export const invoicePaymentSchema = z.preprocess((value) => {
  const form = asFormRecord(value);

  return {
    amount: form.amount,
    paidAt: form.paidAt,
    reference: form.reference,
  };
}, z
  .object({
    amount: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value === undefined ? "" : String(value)),
      z.string()
        .min(1, paymentAmountRequiredMessage)
        .transform((value, ctx) => {
          const amount = Number(value);

          if (!Number.isFinite(amount)) {
            ctx.addIssue({
              code: "custom",
              message: paymentAmountInvalidMessage,
            });
            return z.NEVER;
          }

          return amount;
        })
        .refine((amount) => amount > 0, paymentAmountPositiveMessage),
    ),
    paidAt: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z.string().min(1, paidAtRequiredMessage),
    ),
    reference: z.string().trim().max(200, "Reference must be 200 characters or fewer.").default(""),
  })
  .superRefine((value, ctx) => {
    if (!value.paidAt) {
      return;
    }

    if (Number.isNaN(Date.parse(value.paidAt))) {
      ctx.addIssue({
        code: "custom",
        path: ["paidAt"],
        message: paidAtInvalidMessage,
      });
    }
  })
  .transform((value) => ({
    amountCents: amountToCents(value.amount),
    paidAt: new Date(`${value.paidAt}T00:00:00.000Z`),
    reference: value.reference,
  })));

export type InvoicePaymentForm = z.infer<typeof invoicePaymentSchema>;

export type InvoicePaymentValues = {
  amount: string;
  paidAt: string;
  reference: string;
};

export type InvoicePaymentErrors = Partial<Record<keyof InvoicePaymentValues, string[]>>;

const metadataText = (label: string) =>
  z.string().trim().max(2000, `${label} must be 2,000 characters or fewer.`).default("");

export const invoiceMetadataSchema = z.preprocess((value) => {
  const form = asFormRecord(value);

  return {
    intent: form.intent,
    paymentInstructions: form.paymentInstructions,
    notes: form.notes,
  };
}, z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("notes"),
    notes: metadataText("Notes"),
  }),
  z.object({
    intent: z.literal("paymentInstructions"),
    paymentInstructions: metadataText("Payment instructions"),
  }),
]));

export type InvoiceMetadataForm = z.infer<typeof invoiceMetadataSchema>;
export type InvoiceMetadataIntent = InvoiceMetadataForm["intent"];

export type InvoiceMetadataValues = {
  paymentInstructions: string;
  notes: string;
};

export type InvoiceMetadataErrors = Partial<Record<keyof InvoiceMetadataValues, string[]>>;

export type InvoiceLineValues = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  taxRate: string;
};

export type InvoiceFormValues = {
  customerId?: string;
  currency: string;
  issueDate?: string;
  dueDate?: string;
  invoiceDiscountType: DiscountType;
  invoiceDiscountValue: string;
  applyWithholding: boolean;
  withholdingType: "IRPF" | "";
  withholdingRateType: string;
  withholdingRate: string;
  paymentInstructions: string;
  notes: string;
  lines: InvoiceLineValues[];
};

export type InvoiceLineErrors = Partial<Record<keyof InvoiceLineForm, string[]>>;
export type InvoiceFormErrors = Partial<
  Record<
    | "customerId"
    | "currency"
    | "issueDate"
    | "dueDate"
    | "invoiceDiscountValue"
    | "withholdingType"
    | "withholdingRate"
    | "paymentInstructions"
    | "notes"
    | "lineItems",
    string[]
  >
> & {
  lines?: InvoiceLineErrors[];
};

export const createInvoiceFormValues = (
  paymentInstructions = "",
  currency = defaultCurrency,
  defaultWithholdingRate = "15",
  countryCode?: string | null,
): InvoiceFormValues => ({
  currency,
  issueDate: new Date().toISOString().slice(0, 10),
  invoiceDiscountType: "amount",
  invoiceDiscountValue: "0",
  applyWithholding: false,
  withholdingType: "IRPF",
  withholdingRateType:
    resolveWithholdingRateType(defaultWithholdingRate, countryCode) || customRateType,
  withholdingRate: defaultWithholdingRate,
  paymentInstructions,
  notes: "",
  lines: [
    {
      description: "",
      quantity: "1",
      unitPrice: "0",
      discountType: "amount",
      discountValue: "0",
      taxRate: "0",
    },
  ],
});

export const normalizeInvoiceFormValues = (value: unknown): InvoiceFormValues => {
  const form = asFormRecord(value);
  const descriptions = toArray(form.lineDescription);
  const quantities = toArray(form.quantity);
  const unitPrices = toArray(form.unitPrice);
  const discountTypes = toArray(form.lineDiscountType);
  const discountValues = toArray(form.lineDiscountValue);
  const taxRates = toArray(form.taxRate);
  const withholdingRate = stringValue(form.withholdingRate, "15");
  const lineCount = Math.max(
    descriptions.length,
    quantities.length,
    unitPrices.length,
    discountTypes.length,
    discountValues.length,
    taxRates.length,
    1,
  );

  return {
    customerId: stringValue(form.customerId),
    currency: stringValue(form.currency, defaultCurrency),
    issueDate: stringValue(form.issueDate),
    dueDate: stringValue(form.dueDate),
    invoiceDiscountType:
      stringValue(form.invoiceDiscountType, "amount") === "percent" ? "percent" : "amount",
    invoiceDiscountValue: stringValue(form.invoiceDiscountValue, "0"),
    applyWithholding:
      form.applyWithholding === "on" ||
      form.applyWithholding === "true" ||
      form.applyWithholding === true,
    withholdingType: stringValue(form.withholdingType) === "IRPF" ? "IRPF" : "",
    withholdingRateType: (() => {
      const rateType = stringValue(form.withholdingRateType, customRateType);

      if (rateType === customRateType) {
        return rateType;
      }

      const numeric = Number(rateType);

      return Number.isFinite(numeric) && numeric > 0 ? rateType : customRateType;
    })(),
    withholdingRate,
    paymentInstructions: stringValue(form.paymentInstructions),
    notes: stringValue(form.notes),
    lines: Array.from({ length: lineCount }, (_, index) => ({
      description: stringValue(descriptions[index]),
      quantity: stringValue(quantities[index], "1"),
      unitPrice: stringValue(unitPrices[index], "0"),
      discountType:
        stringValue(discountTypes[index], "amount") === "percent" ? "percent" : "amount",
      discountValue: stringValue(discountValues[index], "0"),
      taxRate: stringValue(taxRates[index], "0"),
    })),
  };
};

export const createInvoiceMetadataValues = (
  paymentInstructions = "",
  notes = "",
): InvoiceMetadataValues => ({
  paymentInstructions,
  notes,
});

export const normalizeInvoiceMetadataValues = (value: unknown): InvoiceMetadataValues => {
  const form = asFormRecord(value);

  return {
    paymentInstructions: stringValue(form.paymentInstructions),
    notes: stringValue(form.notes),
  };
};

export const createInvoicePaymentValues = (amount = ""): InvoicePaymentValues => ({
  amount,
  paidAt: new Date().toISOString().slice(0, 10),
  reference: "",
});

export const normalizeInvoicePaymentValues = (value: unknown): InvoicePaymentValues => {
  const form = asFormRecord(value);

  return {
    amount: stringValue(form.amount),
    paidAt: stringValue(form.paidAt),
    reference: stringValue(form.reference),
  };
};

export const formatInvoiceFormErrors = (error: z.ZodError<InvoiceForm>) =>
  error.issues.reduce<InvoiceFormErrors>((errors, issue) => {
    const [field, index, lineField] = issue.path;

    if (field === "lines" && typeof index === "number" && typeof lineField === "string") {
      errors.lines ??= [];
      errors.lines[index] ??= {};
      const lineErrors = errors.lines[index] as Record<string, string[] | undefined>;

      lineErrors[lineField] ??= [];
      lineErrors[lineField].push(issue.message);

      return errors;
    }

    if (field === "lines") {
      errors.lineItems ??= [];
      errors.lineItems.push(issue.message);

      return errors;
    }

    if (typeof field === "string") {
      const fieldName = field as
        | "customerId"
        | "issueDate"
        | "dueDate"
        | "invoiceDiscountValue"
        | "withholdingType"
        | "withholdingRate"
        | "paymentInstructions"
        | "notes";

      errors[fieldName] ??= [];
      errors[fieldName].push(issue.message);
    }

    return errors;
  }, {});

export const formatInvoiceMetadataErrors = (error: z.ZodError<InvoiceMetadataForm>) =>
  error.issues.reduce<InvoiceMetadataErrors>((errors, issue) => {
    const [field] = issue.path;

    if (field === "paymentInstructions" || field === "notes") {
      errors[field] ??= [];
      errors[field].push(issue.message);
    }

    return errors;
  }, {});

export const formatInvoicePaymentErrors = (error: z.ZodError<InvoicePaymentForm>) =>
  error.issues.reduce<InvoicePaymentErrors>((errors, issue) => {
    const [field] = issue.path;

    if (field === "amount" || field === "paidAt" || field === "reference") {
      errors[field] ??= [];
      errors[field].push(issue.message);
    }

    return errors;
  }, {});
