import { z } from "zod";
import {
  amountToCents,
  calculateDiscountCents,
  lineTotalCents,
  type DiscountType,
} from "../../lib/money";

export const dueDateBeforeIssueDateMessage = "Due date cannot be before the issue date.";
export const paidAtRequiredMessage = "Enter a paid date.";
export const paidAtInvalidMessage = "Enter a valid paid date.";

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

const dateInput = (requiredMessage: string, invalidMessage: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, requiredMessage).pipe(z.coerce.date({ error: invalidMessage })),
  );

const discountTypeSchema = z.enum(["amount", "percent"]);

const discountValueSchema = z.coerce.number().nonnegative("Discount cannot be negative.");
const statusActionSchema = z.enum(["send", "markOverdue", "markPaid", "void"], {
  error: "Choose a valid invoice status action.",
});

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Line description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative."),
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

export const invoiceFormSchema = z.preprocess((value) => {
  const form = asFormRecord(value);

  return {
    customerId: form.customerId,
    issueDate: form.issueDate,
    dueDate: form.dueDate,
    invoiceDiscountType: form.invoiceDiscountType,
    invoiceDiscountValue: form.invoiceDiscountValue,
    notes: form.notes,
    lines: normalizeLineInputs(form),
  };
}, z
  .object({
    customerId: z.string().uuid("Choose a customer."),
    issueDate: dateInput("Enter an issue date.", "Enter a valid issue date."),
    dueDate: dateInput("Enter a due date.", "Enter a valid due date."),
    invoiceDiscountType: discountTypeSchema.default("amount"),
    invoiceDiscountValue: discountValueSchema.default(0),
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
  }));

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;
export type InvoiceLineForm = InvoiceForm["lines"][number];

export const invoiceStatusActionSchema = z.preprocess((value) => {
  const form = asFormRecord(value);

  return {
    action: form.action,
    paidAt: form.paidAt,
    reference: form.reference,
  };
}, z
  .object({
    action: statusActionSchema,
    paidAt: z.preprocess(
      (value) => (typeof value === "string" ? value : ""),
      z.string().trim().optional(),
    ),
    reference: z.string().trim().max(200, "Reference must be 200 characters or fewer.").default(""),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "markPaid") {
      return;
    }

    if (!value.paidAt) {
      ctx.addIssue({
        code: "custom",
        path: ["paidAt"],
        message: paidAtRequiredMessage,
      });
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
    action: value.action,
    paidAt: value.action === "markPaid" ? new Date(`${value.paidAt}T00:00:00.000Z`) : undefined,
    reference: value.reference,
  })));

export type InvoiceStatusActionForm = z.infer<typeof invoiceStatusActionSchema>;

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
  issueDate?: string;
  dueDate?: string;
  invoiceDiscountType: DiscountType;
  invoiceDiscountValue: string;
  notes: string;
  lines: InvoiceLineValues[];
};

export type InvoiceLineErrors = Partial<Record<keyof InvoiceLineForm, string[]>>;
export type InvoiceFormErrors = Partial<
  Record<
    "customerId" | "issueDate" | "dueDate" | "invoiceDiscountValue" | "notes" | "lineItems",
    string[]
  >
> & {
  lines?: InvoiceLineErrors[];
};

export const createInvoiceFormValues = (notes = ""): InvoiceFormValues => ({
  issueDate: new Date().toISOString().slice(0, 10),
  invoiceDiscountType: "amount",
  invoiceDiscountValue: "0",
  notes,
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
    issueDate: stringValue(form.issueDate),
    dueDate: stringValue(form.dueDate),
    invoiceDiscountType:
      stringValue(form.invoiceDiscountType, "amount") === "percent" ? "percent" : "amount",
    invoiceDiscountValue: stringValue(form.invoiceDiscountValue, "0"),
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
        | "notes";

      errors[fieldName] ??= [];
      errors[fieldName].push(issue.message);
    }

    return errors;
  }, {});
