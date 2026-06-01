import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  dueDateBeforeIssueDateMessage,
  formatInvoiceFormErrors,
  invoiceFormSchema,
  invoicePaymentSchema,
  invoiceStatusActionSchema,
  paidAtInvalidMessage,
  paidAtRequiredMessage,
  paymentAmountPositiveMessage,
  paymentAmountRequiredMessage,
} from "./invoice.schema";

const validInvoiceForm = {
  customerId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
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

  test("normalizes invoice discount and notes", () => {
    const result = invoiceFormSchema.safeParse({
      ...validInvoiceForm,
      invoiceDiscountType: "percent",
      invoiceDiscountValue: "12.5",
      notes: "  Pay within 14 days.  ",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.invoiceDiscountType, "percent");
    assert.equal(result.data.invoiceDiscountValue, 12.5);
    assert.equal(result.data.notes, "Pay within 14 days.");
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

    assert.equal(missingAmount.success, false);
    assert.deepEqual((missingAmount.error.flatten().fieldErrors as Record<string, string[]>).amount, [
      paymentAmountRequiredMessage,
    ]);
    assert.equal(zeroAmount.success, false);
    assert.deepEqual((zeroAmount.error.flatten().fieldErrors as Record<string, string[]>).amount, [
      paymentAmountPositiveMessage,
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
