import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import {
  createInvoice,
  renderNewInvoice,
  showInvoice,
  updateInvoiceStatusController,
} from "./invoice.controller";

type MockRequest = Request & {
  body: Record<string, unknown>;
  params: Record<string, string>;
  auth: NonNullable<Request["auth"]>;
  path: string;
  flashMessages: Record<string, string[]>;
};

type MockResponse = Response & {
  statusCode?: number;
  redirectedTo?: string;
  renderedView?: string;
  renderedData?: unknown;
};

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  customer: {
    findMany: unknown;
  };
  invoice: {
    findFirst: unknown;
    update: unknown;
  };
};

const originalTransaction = prismaMock.$transaction;
const originalFindMany = prismaMock.customer.findMany;
const originalInvoiceFindFirst = prismaMock.invoice.findFirst;
const originalInvoiceUpdate = prismaMock.invoice.update;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.customer.findMany = originalFindMany;
  prismaMock.invoice.findFirst = originalInvoiceFindFirst;
  prismaMock.invoice.update = originalInvoiceUpdate;
});

const createRequest = (body: Record<string, unknown> = {}, params: Record<string, string> = {}) =>
  ({
    body,
    params,
    path: params.invoiceId ? `/invoices/${params.invoiceId}` : "/invoices/new",
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
    flashMessages: {},
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
  }) as MockRequest;

const createResponse = () => {
  const res: {
    statusCode?: number;
    redirectedTo?: string;
    renderedView?: string;
    renderedData?: unknown;
    status?: (statusCode: number) => MockResponse;
    redirect?: (path: string) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
  } = {};

  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res as unknown as MockResponse;
  };
  res.redirect = (path: string) => {
    res.redirectedTo = path;
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

test("showInvoice renders invoice details and available actions", async () => {
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "DRAFT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    customer: { name: "Ada Co" },
    lines: [],
    payments: [],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  const req = createRequest({}, { invoiceId: invoice.id });
  const res = createResponse();

  await showInvoice(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual(res.renderedData, {
    title: "INV-2026-0001",
    invoice,
    allowedActions: ["send", "void"],
    isEffectivelyOverdue: false,
    paidAtDefault: new Date().toISOString().slice(0, 10),
  });
});

test("showInvoice renders not found for missing invoices", async () => {
  prismaMock.invoice.findFirst = async () => null;
  const req = createRequest({}, { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" });
  const res = createResponse();

  await showInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("updateInvoiceStatusController redirects with flash error for invalid transitions", async () => {
  prismaMock.invoice.findFirst = async () => ({
    id: "invoice_1",
    status: "PAID",
    totalCents: 10000,
  });
  const req = createRequest(
    { action: "void" },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await updateInvoiceStatusController(req, res, () => undefined);

  assert.deepEqual(req.flashMessages.error, ["That status change is not allowed for this invoice."]);
  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
});

test("updateInvoiceStatusController redirects with flash success for valid transitions", async () => {
  let updateArgs: unknown;
  prismaMock.invoice.findFirst = async () => ({
    id: "invoice_1",
    status: "DRAFT",
    totalCents: 10000,
  });
  prismaMock.invoice.update = async (args: unknown) => {
    updateArgs = args;
  };
  const req = createRequest(
    { action: "send" },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await updateInvoiceStatusController(req, res, () => undefined);

  assert.deepEqual(updateArgs, {
    where: { id: "invoice_1" },
    data: { status: "SENT" },
  });
  assert.deepEqual(req.flashMessages.success, ["Invoice status updated."]);
  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
});
