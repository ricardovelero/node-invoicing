import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import {
  createInvoiceDisplay,
  createInvoice,
  recordInvoicePaymentController,
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
        locale: "en-GB",
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

const statusInvoice = {
  id: "invoice_1",
  status: "DRAFT",
  subtotalCents: 10000,
  discountCents: 0,
  taxCents: 0,
  totalCents: 10000,
  currency: "EUR",
  customer: {
    name: "Ada Co",
    email: null,
    taxId: null,
    addressLine1: null,
    city: null,
    country: null,
  },
  organization: {
    name: "Analytical Engines",
    legalName: null,
    taxId: null,
    addressLine1: null,
    city: null,
    country: null,
    paymentInstructions: null,
  },
  snapshot: null,
};

const mockStatusTransaction = ({
  invoice,
  onInvoiceUpdate,
}: {
  invoice: unknown;
  onInvoiceUpdate?: (args: unknown) => void;
}) => {
  prismaMock.$transaction = async (
    callback: (tx: {
      invoice: {
        findFirst: () => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
      };
      invoiceSnapshot: {
        create: () => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return invoice;
        },
        async update(args) {
          onInvoiceUpdate?.(args);
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async create() {
          return { invoiceId: "invoice_1" };
        },
      },
    });
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
      currency: "EUR",
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
  const today = new Date().toISOString().slice(0, 10);
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "DRAFT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    currency: "EUR",
    customer: { id: "customer_1", name: "Ada Co" },
    snapshot: null,
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
    invoiceDisplay: {
      customerName: "Ada Co",
      customerHref: "/customers/customer_1",
      currency: "EUR",
      snapshot: null,
    },
    allowedActions: ["send", "void"],
    canRecordPayment: false,
    isEffectivelyOverdue: false,
    paymentSummary: {
      paidCents: 0,
      outstandingCents: 10000,
      isPaid: false,
    },
    paymentValues: {
      amount: "100.00",
      paidAt: today,
      reference: "",
    },
    paymentErrors: {},
  });
});

test("createInvoiceDisplay uses live customer and currency for drafts", () => {
  const display = createInvoiceDisplay(
    {
      status: "DRAFT",
      currency: "EUR",
      customer: { id: "customer_1", name: "Live Ada Co" },
      snapshot: {
        customerName: "Snapshot Ada Co",
      },
    } as unknown as Parameters<typeof createInvoiceDisplay>[0],
  );

  assert.deepEqual(display, {
    customerName: "Live Ada Co",
    customerHref: "/customers/customer_1",
    currency: "EUR",
    snapshot: null,
  });
});

test("createInvoiceDisplay uses snapshot customer and currency for issued invoices", () => {
  const snapshot = {
    customerName: "Snapshot Ada Co",
  };
  const display = createInvoiceDisplay(
    {
      status: "SENT",
      currency: "GBP",
      customer: { id: "customer_1", name: "Live Ada Co" },
      snapshot,
    } as unknown as Parameters<typeof createInvoiceDisplay>[0],
  );

  assert.deepEqual(display, {
    customerName: "Snapshot Ada Co",
    customerHref: null,
    currency: "GBP",
    snapshot,
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
  mockStatusTransaction({
    invoice: {
      ...statusInvoice,
      status: "PAID",
    },
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
  mockStatusTransaction({
    invoice: statusInvoice,
    onInvoiceUpdate: (args) => {
      updateArgs = args;
    },
  });
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

test("recordInvoicePaymentController redirects with flash success for valid payments", async () => {
  let createdPaymentData: unknown;
  let updatedInvoiceData: unknown;
  prismaMock.$transaction = async (
    callback: (tx: {
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
      payment: {
        aggregate: () => Promise<{ _sum: { amountCents: number } }>;
        create: (args: { data: unknown }) => Promise<unknown>;
      };
      invoice: { update: (args: unknown) => Promise<unknown> };
    }) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => [
        {
          id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
          status: "SENT",
          totalCents: 10000,
          dueDate: new Date("2099-06-27T00:00:00.000Z"),
        },
      ],
      payment: {
        async aggregate() {
          return { _sum: { amountCents: 0 } };
        },
        async create(args) {
          createdPaymentData = args.data;
          return { id: "payment_1" };
        },
      },
      invoice: {
        async update(args) {
          updatedInvoiceData = args;
          return { id: "invoice_1" };
        },
      },
    });
  const req = createRequest(
    { amount: "25.50", paidAt: "2026-05-29", reference: "  BANK-123  " },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await recordInvoicePaymentController(req, res, () => undefined);

  assert.deepEqual(createdPaymentData, {
    invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    amountCents: 2550,
    paidAt: new Date("2026-05-29T00:00:00.000Z"),
    reference: "BANK-123",
  });
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "PARTIALLY_PAID" },
  });
  assert.deepEqual(req.flashMessages.success, ["Payment recorded."]);
  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
});

test("recordInvoicePaymentController re-renders invoice detail for invalid payment input", async () => {
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "SENT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    customer: { id: "customer_1", name: "Ada Co" },
    lines: [],
    payments: [],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  const req = createRequest(
    { amount: "", paidAt: "", reference: "" },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await recordInvoicePaymentController(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual((res.renderedData as { paymentErrors: unknown }).paymentErrors, {
    amount: ["Enter a payment amount."],
    paidAt: ["Enter a paid date."],
  });
});

test("recordInvoicePaymentController re-renders invoice detail for overpayments", async () => {
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "SENT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    customer: { id: "customer_1", name: "Ada Co" },
    lines: [],
    payments: [{ amountCents: 9000 }],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  prismaMock.$transaction = async (
    callback: (tx: {
      $queryRaw: () => Promise<unknown[]>;
      payment: {
        aggregate: () => Promise<{ _sum: { amountCents: number } }>;
        create: () => Promise<unknown>;
      };
      invoice: { update: () => Promise<unknown> };
    }) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => [
        {
          id: invoice.id,
          status: "SENT",
          totalCents: 10000,
          dueDate: new Date("2099-06-27T00:00:00.000Z"),
        },
      ],
      payment: {
        async aggregate() {
          return { _sum: { amountCents: 9000 } };
        },
        async create() {
          return { id: "payment_1" };
        },
      },
      invoice: {
        async update() {
          return { id: "invoice_1" };
        },
      },
    });
  const req = createRequest(
    { amount: "10.01", paidAt: "2026-05-29", reference: "" },
    { invoiceId: invoice.id },
  );
  const res = createResponse();

  await recordInvoicePaymentController(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual((res.renderedData as { paymentErrors: unknown }).paymentErrors, {
    amount: ["Payment cannot exceed the outstanding balance."],
  });
});
