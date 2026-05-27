import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { invoiceFormSchema } from "./invoice.schema";

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
});
