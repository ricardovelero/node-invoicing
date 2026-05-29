import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createInvoice, renderNewInvoice } from "./invoice.controller";

type MockRequest = Request & {
  body: Record<string, unknown>;
  auth: NonNullable<Request["auth"]>;
};

type MockResponse = Response & {
  statusCode?: number;
  renderedView?: string;
  renderedData?: unknown;
};

const prismaMock = prisma as unknown as {
  customer: {
    findMany: unknown;
  };
};

const originalFindMany = prismaMock.customer.findMany;

afterEach(() => {
  prismaMock.customer.findMany = originalFindMany;
});

const createRequest = (body: Record<string, unknown> = {}) =>
  ({
    body,
    auth: {
      user: {
        id: "user_1",
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      organization: {
        id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        name: "Analytical Engines",
        legalName: null,
        taxId: null,
        addressLine1: null,
        city: null,
        country: null,
        currency: "EUR",
        paymentInstructions: "Pay by bank transfer.",
      },
      role: "OWNER",
    },
  }) as MockRequest;

const createResponse = () => {
  const res: {
    statusCode?: number;
    renderedView?: string;
    renderedData?: unknown;
    status?: (statusCode: number) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
  } = {};

  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res as unknown as MockResponse;
  };
  res.render = (view: string, data: unknown) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

test("renderNewInvoice defaults notes from organization payment instructions", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest();
  const res = createResponse();

  await renderNewInvoice(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "New invoice",
    customers,
    values: {
      issueDate: new Date().toISOString().slice(0, 10),
      invoiceDiscountType: "amount",
      invoiceDiscountValue: "0",
      notes: "Pay by bank transfer.",
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
    },
    errors: {},
  });
});

test("createInvoice preserves submitted notes after validation errors", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest({
    customerId: "not-a-uuid",
    issueDate: "",
    dueDate: "",
    notes: "Use these submitted notes.",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.equal(
    (res.renderedData as { values: { notes: string } }).values.notes,
    "Use these submitted notes.",
  );
});
