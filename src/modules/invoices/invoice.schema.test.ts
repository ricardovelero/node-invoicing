import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  dueDateBeforeIssueDateMessage,
  formatInvoiceFormErrors,
  invoiceFormSchema,
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
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data.lines, [
      {
        description: "Consulting services",
        quantity: 2,
        unitPrice: 100,
      },
      {
        description: "Support",
        quantity: 1.5,
        unitPrice: 75,
      },
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
    });

    assert.equal(result.success, false);
    const errors = formatInvoiceFormErrors(result.error);

    assert.equal(errors.lines?.[0], undefined);
    assert.deepEqual(errors.lines?.[1], {
      description: ["Line description is required."],
      quantity: ["Quantity must be greater than zero."],
      unitPrice: ["Unit price cannot be negative."],
    });
  });
});
