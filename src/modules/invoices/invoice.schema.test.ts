import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  dueDateBeforeIssueDateMessage,
  createInvoiceFormSchema,
  formatInvoiceFormErrors,
  formatInvoiceMetadataErrors,
  invoiceFormSchema,
  invoiceListQuerySchema,
  invoiceMetadataSchema,
  invoicePaymentSchema,
  invoiceStatusActionSchema,
  paidAtInvalidMessage,
  paidAtRequiredMessage,
  paymentAmountInvalidMessage,
  paymentAmountPositiveMessage,
  paymentAmountRequiredMessage,
} from "./invoice.schema";

const validInvoiceForm = {
  customerId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
  currency: "EUR",
  issueDate: "2026-05-27",
  dueDate: "2026-06-27",
  lineDescription: "Consulting services",
  quantity: "1",
  unitPrice: "100",
};

describe("invoiceFormSchema", () => {
  test("returns clear messages for empty date fields", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      issueDate: "",
      dueDate: "",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.issueDate, ["Enter an issue date."]);
    assert.deepEqual(result.error.flatten().fieldErrors.dueDate, ["Enter a due date."]);
  });

  test("returns clear messages for invalid date fields", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      issueDate: "not-a-date",
      dueDate: "not-a-date",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.issueDate, ["Enter a valid issue date."]);
    assert.deepEqual(result.error.flatten().fieldErrors.dueDate, ["Enter a valid due date."]);
  });

  test("rejects a due date before the issue date", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      issueDate: "2026-06-27",
      dueDate: "2026-05-27",
    });

    assert.equal(result.success, false);
    assert.deepEqual(formatInvoiceFormErrors(result.error).dueDate, [
      dueDateBeforeIssueDateMessage,
    ]);
  });

  test("normalizes repeated line fields into invoice lines", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      lineDescription: ["Consulting services", "Support"],
      quantity: ["2", "1.5"],
      unitPrice: ["100", "75"],
      lineDiscountType: ["amount", "percent"],
      lineDiscountValue: ["10", "5"],
      taxRate: ["21", "10"],
    });

    assert.equal(result.success, true);
    assert.equal(result.data.currency, "EUR");
    assert.deepEqual(result.data.lines, [
      {
        description: "Consulting services",
        quantity: 2,
        unitPrice: 100,
        discountType: "amount",
        discountValue: 10,
        taxRate: 21,
      },
      {
        description: "Support",
        quantity: 1.5,
        unitPrice: 75,
        discountType: "percent",
        discountValue: 5,
        taxRate: 10,
      },
    ]);
  });

  test("rejects unsupported currencies", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      currency: "JPY",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.currency, [
      "Choose a supported currency.",
    ]);
  });

  test("rejects empty line unit prices but allows explicit zero", () => {
    const emptyResult = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      unitPrice: "",
    });
    const zeroResult = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      unitPrice: "0",
    });

    assert.equal(emptyResult.success, false);
    assert.deepEqual(formatInvoiceFormErrors(emptyResult.error).lines?.[0], {
      unitPrice: ["Enter a unit price."],
    });
    assert.equal(zeroResult.success, true);
    assert.equal(zeroResult.data.lines[0]?.unitPrice, 0);
  });

  test("normalizes invoice discount, payment instructions, and notes", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      invoiceDiscountType: "percent",
      invoiceDiscountValue: "12.5",
      paymentInstructions: "  Pay by bank transfer.  ",
      notes: "  Pay within 14 days.  ",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.invoiceDiscountType, "percent");
    assert.equal(result.data.invoiceDiscountValue, 12.5);
    assert.equal(result.data.paymentInstructions, "Pay by bank transfer.");
    assert.equal(result.data.notes, "Pay within 14 days.");
  });

  test("validates invoice-level IRPF withholding rates when allowed", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      applyWithholding: "on",
      withholdingType: "IRPF",
      withholdingRateType: "custom",
      withholdingRate: "12.5",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.applyWithholding, true);
    assert.equal(result.data.withholdingType, "IRPF");
    assert.equal(result.data.withholdingRate, 12.5);
  });

  test("rejects non-positive IRPF rates when withholding is applied", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      applyWithholding: "on",
      withholdingType: "IRPF",
      withholdingRateType: "custom",
      withholdingRate: "0",
    });

    assert.equal(result.success, false);
    assert.deepEqual(formatInvoiceFormErrors(result.error).withholdingRate, [
      "Withholding rate must be greater than zero.",
    ]);
  });

  test("strips withholding fields when organization settings do not allow withholding", () => {
    const result = createInvoiceFormSchema({ withholdingAllowed: false }).safeParse({
      ...validInvoiceForm,
      applyWithholding: "on",
      withholdingType: "IRPF",
      withholdingRateType: "15",
      withholdingRate: "15",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.applyWithholding, false);
    assert.equal(result.data.withholdingRate, null);
  });

  test("rejects long payment instructions", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      paymentInstructions: "x".repeat(2001),
    });

    assert.equal(result.success, false);
    assert.deepEqual(formatInvoiceFormErrors(result.error).paymentInstructions, [
      "Payment instructions must be 2,000 characters or fewer.",
    ]);
  });

  test("rejects submissions without line items", () => {
    const result = invoiceFormSchema.safeParse({
      customerId: validInvoiceForm.customerId,
      issueDate: validInvoiceForm.issueDate,
      dueDate: validInvoiceForm.dueDate,
    });

    assert.equal(result.success, false);
    assert.deepEqual(formatInvoiceFormErrors(result.error).lineItems, [
      "Add at least one line item.",
    ]);
  });

  test("returns row-level errors for invalid line fields", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      lineDescription: ["Consulting services", ""],
      quantity: ["2", "0"],
      unitPrice: ["100", "-1"],
      lineDiscountValue: ["0", "-1"],
      taxRate: ["21", "-1"],
    });

    assert.equal(result.success, false);
    const errors = formatInvoiceFormErrors(result.error);

    assert.equal(errors.lines?.[0], undefined);
    assert.deepEqual(errors.lines?.[1], {
      description: ["Line description is required."],
      quantity: ["Quantity must be greater than zero."],
      unitPrice: ["Unit price cannot be negative."],
      discountValue: ["Discount cannot be negative."],
      taxRate: ["Tax rate cannot be negative."],
    });
  });

  test("rejects discounts that exceed their bases", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      quantity: "1",
      unitPrice: "100",
      lineDiscountType: "amount",
      lineDiscountValue: "120",
      invoiceDiscountType: "amount",
      invoiceDiscountValue: "1",
    });

    assert.equal(result.success, false);
    const errors = formatInvoiceFormErrors(result.error);

    assert.deepEqual(errors.lines?.[0], {
      discountValue: ["Line discount cannot exceed the line subtotal."],
    });
  });

  test("rejects invoice discount amounts above the subtotal after line discounts", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      quantity: "1",
      unitPrice: "100",
      lineDiscountType: "amount",
      lineDiscountValue: "25",
      invoiceDiscountType: "amount",
      invoiceDiscountValue: "80",
    });

    assert.equal(result.success, false);
    assert.deepEqual(formatInvoiceFormErrors(result.error).invoiceDiscountValue, [
      "Invoice discount cannot exceed the subtotal after line discounts.",
    ]);
  });
});

describe("invoiceMetadataSchema", () => {
  test("normalizes note metadata", () => {
    const result = invoiceMetadataSchema.safeParse({
      intent: "notes",
      notes: "  Internal note.  ",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      intent: "notes",
      notes: "Internal note.",
    });
  });

  test("normalizes payment instruction metadata", () => {
    const result = invoiceMetadataSchema.safeParse({
      intent: "paymentInstructions",
      paymentInstructions: "  Pay this invoice by card.  ",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      intent: "paymentInstructions",
      paymentInstructions: "Pay this invoice by card.",
    });
  });

  test("rejects only the intended long metadata field", () => {
    const paymentResult = invoiceMetadataSchema.safeParse({
      intent: "paymentInstructions",
      paymentInstructions: "x".repeat(2001),
      notes: "Ignored note.",
    });
    const noteResult = invoiceMetadataSchema.safeParse({
      intent: "notes",
      paymentInstructions: "Ignored instructions.",
      notes: "y".repeat(2001),
    });

    assert.equal(paymentResult.success, false);
    assert.deepEqual(formatInvoiceMetadataErrors(paymentResult.error), {
      paymentInstructions: [
        "Payment instructions must be 2,000 characters or fewer.",
      ],
    });
    assert.equal(noteResult.success, false);
    assert.deepEqual(formatInvoiceMetadataErrors(noteResult.error), {
      notes: ["Notes must be 2,000 characters or fewer."],
    });
  });
});

describe("invoiceStatusActionSchema", () => {
  test("accepts valid non-payment status actions", () => {
    const result = invoiceStatusActionSchema.safeParse({
      action: "send",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      action: "send",
    });
  });

  test("rejects invalid action values", () => {
    const result = invoiceStatusActionSchema.safeParse({
      action: "markPaid",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error.flatten().fieldErrors.action, [
      "Choose a valid invoice status action.",
    ]);
  });

});

describe("invoicePaymentSchema", () => {
  test("normalizes payment values", () => {
    const result = invoicePaymentSchema.safeParse({
      amount: "123.45",
      paidAt: "2026-05-29",
      reference: "  BANK-123  ",
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      amountCents: 12345,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "BANK-123",
    });
  });

  test("requires a positive payment amount", () => {
    const missingAmount = invoicePaymentSchema.safeParse({
      amount: "",
      paidAt: "2026-05-29",
    });
    const zeroAmount = invoicePaymentSchema.safeParse({
      amount: "0",
      paidAt: "2026-05-29",
    });
    const invalidAmount = invoicePaymentSchema.safeParse({
      amount: "not-a-number",
      paidAt: "2026-05-29",
    });

    assert.equal(missingAmount.success, false);
    assert.deepEqual((missingAmount.error.flatten().fieldErrors as Record<string, string[]>).amount, [
      paymentAmountRequiredMessage,
    ]);
    assert.equal(zeroAmount.success, false);
    assert.deepEqual((zeroAmount.error.flatten().fieldErrors as Record<string, string[]>).amount, [
      paymentAmountPositiveMessage,
    ]);
    assert.equal(invalidAmount.success, false);
    assert.deepEqual((invalidAmount.error.flatten().fieldErrors as Record<string, string[]>).amount, [
      paymentAmountInvalidMessage,
    ]);
  });

  test("requires a valid paid date for payments", () => {
    const missingDate = invoicePaymentSchema.safeParse({
      amount: "10",
    });
    const invalidDate = invoicePaymentSchema.safeParse({
      amount: "10",
      paidAt: "not-a-date",
    });

    assert.equal(missingDate.success, false);
    assert.deepEqual(missingDate.error.flatten().fieldErrors.paidAt, [paidAtRequiredMessage]);
    assert.equal(invalidDate.success, false);
    assert.deepEqual(invalidDate.error.flatten().fieldErrors.paidAt, [paidAtInvalidMessage]);
  });
});

describe("invoiceListQuerySchema", () => {
  test("normalizes valid list query params", () => {
    const result = invoiceListQuerySchema.parse({
      page: "2",
      limit: "50",
      q: "  acme  ",
      status: "paid",
      sort: "dueDate",
      direction: "asc",
    });

    assert.deepEqual(result, {
      page: 2,
      limit: 50,
      q: "acme",
      status: "PAID",
      sort: "dueDate",
      direction: "asc",
    });
  });

  test("falls back to sensible defaults for invalid params", () => {
    const result = invoiceListQuerySchema.parse({
      page: "-4",
      limit: "20abc",
      q: 123,
      status: "deleted",
      sort: "customer.name",
      direction: "sideways",
    });

    assert.deepEqual(result, {
      page: 1,
      limit: 20,
      q: "",
      status: undefined,
      sort: "createdAt",
      direction: "desc",
    });
  });

  test("accepts only supported page sizes and sortable columns", () => {
    assert.equal(invoiceListQuerySchema.parse({ limit: "10" }).limit, 10);
    assert.equal(invoiceListQuerySchema.parse({ limit: "20" }).limit, 20);
    assert.equal(invoiceListQuerySchema.parse({ limit: "50" }).limit, 50);
    assert.equal(invoiceListQuerySchema.parse({ limit: "25" }).limit, 20);
    assert.equal(
      invoiceListQuerySchema.parse({ sort: "totalCents" }).sort,
      "totalCents",
    );
    assert.equal(
      invoiceListQuerySchema.parse({ sort: "customer" }).sort,
      "createdAt",
    );
  });

  test("normalizes repeated query values from the first value", () => {
    const result = invoiceListQuerySchema.parse({
      page: ["3", "4"],
      status: ["overdue", "paid"],
      direction: ["asc", "desc"],
    });

    assert.equal(result.page, 3);
    assert.equal(result.status, "OVERDUE");
    assert.equal(result.direction, "asc");
  });
});
