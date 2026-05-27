import { z } from "zod";

export const dueDateBeforeIssueDateMessage = "Due date cannot be before the issue date.";

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

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Line description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative."),
});

const normalizeLineInputs = (form: Record<string, unknown>) => {
  const descriptions = toArray(form.lineDescription);
  const quantities = toArray(form.quantity);
  const unitPrices = toArray(form.unitPrice);
  const length = Math.max(descriptions.length, quantities.length, unitPrices.length);

  return Array.from({ length }, (_, index) => ({
    description: descriptions[index],
    quantity: quantities[index],
    unitPrice: unitPrices[index],
  }));
};

export const invoiceFormSchema = z.preprocess((value) => {
  const form = asFormRecord(value);

  return {
    customerId: form.customerId,
    issueDate: form.issueDate,
    dueDate: form.dueDate,
    lines: normalizeLineInputs(form),
  };
}, z
  .object({
    customerId: z.string().uuid("Choose a customer."),
    issueDate: dateInput("Enter an issue date.", "Enter a valid issue date."),
    dueDate: dateInput("Enter a due date.", "Enter a valid due date."),
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
  }));

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;
export type InvoiceLineForm = InvoiceForm["lines"][number];

export type InvoiceLineValues = {
  description: string;
  quantity: string;
  unitPrice: string;
};

export type InvoiceFormValues = {
  customerId?: string;
  issueDate?: string;
  dueDate?: string;
  lines: InvoiceLineValues[];
};

export type InvoiceLineErrors = Partial<Record<keyof InvoiceLineForm, string[]>>;
export type InvoiceFormErrors = Partial<
  Record<"customerId" | "issueDate" | "dueDate" | "lineItems", string[]>
> & {
  lines?: InvoiceLineErrors[];
};

export const createInvoiceFormValues = (): InvoiceFormValues => ({
  issueDate: new Date().toISOString().slice(0, 10),
  lines: [{ description: "", quantity: "1", unitPrice: "0" }],
});

export const normalizeInvoiceFormValues = (value: unknown): InvoiceFormValues => {
  const form = asFormRecord(value);
  const descriptions = toArray(form.lineDescription);
  const quantities = toArray(form.quantity);
  const unitPrices = toArray(form.unitPrice);
  const lineCount = Math.max(descriptions.length, quantities.length, unitPrices.length, 1);

  return {
    customerId: stringValue(form.customerId),
    issueDate: stringValue(form.issueDate),
    dueDate: stringValue(form.dueDate),
    lines: Array.from({ length: lineCount }, (_, index) => ({
      description: stringValue(descriptions[index]),
      quantity: stringValue(quantities[index], "1"),
      unitPrice: stringValue(unitPrices[index], "0"),
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
      const fieldName = field as "customerId" | "issueDate" | "dueDate";

      errors[fieldName] ??= [];
      errors[fieldName].push(issue.message);
    }

    return errors;
  }, {});
