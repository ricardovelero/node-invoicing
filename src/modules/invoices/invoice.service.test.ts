import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  calculateInvoicePaymentSummary,
  createInvoiceRecord,
  getInvoiceDetails,
  getInvoiceFormOptions,
  recordInvoicePayment,
  updateInvoiceStatus,
} from "./invoice.service";

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  customer: {
    findFirst: unknown;
    findMany: unknown;
  };
  invoice: {
    create: unknown;
    findFirst: unknown;
    findMany: unknown;
    update: unknown;
  };
  payment: {
    aggregate: unknown;
    create: unknown;
  };
};

type InvoiceCreateTransactionMock = {
  $queryRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<{ reservedValue: bigint | number }>>;
  customer: {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  invoice: {
    create: (args: { data: unknown }) => Promise<unknown>;
  };
};

const originalTransaction = prismaMock.$transaction;
const originalFindFirst = prismaMock.customer.findFirst;
const originalCustomerFindMany = prismaMock.customer.findMany;
const originalCreate = prismaMock.invoice.create;
const originalInvoiceFindFirst = prismaMock.invoice.findFirst;
const originalInvoiceFindMany = prismaMock.invoice.findMany;
const originalInvoiceUpdate = prismaMock.invoice.update;
const originalPaymentAggregate = prismaMock.payment.aggregate;
const originalPaymentCreate = prismaMock.payment.create;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.customer.findMany = originalCustomerFindMany;
  prismaMock.invoice.create = originalCreate;
  prismaMock.invoice.findFirst = originalInvoiceFindFirst;
  prismaMock.invoice.findMany = originalInvoiceFindMany;
  prismaMock.invoice.update = originalInvoiceUpdate;
  prismaMock.payment.aggregate = originalPaymentAggregate;
  prismaMock.payment.create = originalPaymentCreate;
});

test("getInvoiceFormOptions excludes archived customers", async () => {
  let findManyArgs: unknown;
  prismaMock.customer.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const customers = await getInvoiceFormOptions("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");

  assert.deepEqual(customers, []);
  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    orderBy: { name: "asc" },
  });
});

test("createInvoiceRecord creates multiple lines and sums invoice totals", async () => {
  let createdInvoiceData: unknown;
  let customerFindFirstArgs: unknown;
  let reservedNumberOrganizationId: unknown;

  prismaMock.$transaction = async (
    callback: (tx: InvoiceCreateTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async (_strings, organizationId) => {
        reservedNumberOrganizationId = organizationId;
        return [{ reservedValue: 1 }];
      },
      customer: {
        async findFirst(args) {
          customerFindFirstArgs = args;
          return { id: "customer_1" };
        },
      },
      invoice: {
        async create(args) {
          createdInvoiceData = args.data;
          return { id: "invoice_1" };
        },
      },
    });

  const issueDate = new Date("2026-05-27T00:00:00.000Z");
  const dueDate = new Date("2026-06-27T00:00:00.000Z");

  const invoice = await createInvoiceRecord("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    issueDate,
    dueDate,
    invoiceDiscountType: "percent",
    invoiceDiscountValue: 10,
    notes: "Pay within 14 days.",
    lines: [
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
    ],
  });

  const year = new Date().getFullYear();

  assert.deepEqual(invoice, { id: "invoice_1" });
  assert.equal(reservedNumberOrganizationId, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");
  assert.deepEqual(customerFindFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    select: { id: true },
  });
  assert.deepEqual(createdInvoiceData, {
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    number: `INV-${year}-0001`,
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    issueDate,
    dueDate,
    subtotalCents: 31250,
    discountCents: 2969,
    taxCents: 4553,
    totalCents: 31271,
    notes: "Pay within 14 days.",
    lines: {
      create: [
        {
          description: "Consulting services",
          quantity: 2,
          unitPriceCents: 10000,
          discountCents: 1000,
          invoiceDiscountCents: 1900,
          taxRateBps: 2100,
          taxCents: 3591,
          totalCents: 19000,
        },
        {
          description: "Support",
          quantity: 1.5,
          unitPriceCents: 7500,
          discountCents: 563,
          invoiceDiscountCents: 1069,
          taxRateBps: 1000,
          taxCents: 962,
          totalCents: 10687,
        },
      ],
    },
  });
});

test("createInvoiceRecord rejects archived customers", async () => {
  let invoiceCreateCalls = 0;
  let invoiceNumberReservationCalls = 0;

  prismaMock.$transaction = async (
    callback: (tx: InvoiceCreateTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => {
        invoiceNumberReservationCalls += 1;
        return [{ reservedValue: 1 }];
      },
      customer: {
        async findFirst() {
          return null;
        },
      },
      invoice: {
        async create() {
          invoiceCreateCalls += 1;
          return { id: "invoice_1" };
        },
      },
    });

  const invoice = await createInvoiceRecord("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    issueDate: new Date("2026-05-27T00:00:00.000Z"),
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    invoiceDiscountType: "percent",
    invoiceDiscountValue: 0,
    notes: "",
    lines: [
      {
        description: "Consulting services",
        quantity: 1,
        unitPrice: 100,
        discountType: "percent",
        discountValue: 0,
        taxRate: 0,
      },
    ],
  });

  assert.equal(invoice, null);
  assert.equal(invoiceCreateCalls, 0);
  assert.equal(invoiceNumberReservationCalls, 0);
});

test("getInvoiceDetails scopes invoice lookup by organization", async () => {
  let findFirstArgs: unknown;
  prismaMock.invoice.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return { id: "invoice_1" };
  };

  const invoice = await getInvoiceDetails(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
  );

  assert.deepEqual(invoice, { id: "invoice_1" });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    include: {
      customer: true,
      lines: {
        orderBy: { createdAt: "asc" },
      },
      payments: {
        orderBy: { paidAt: "desc" },
      },
    },
  });
});

test("updateInvoiceStatus applies valid status transitions", async () => {
  let updateArgs: unknown;

  prismaMock.invoice.findFirst = async () => ({
    id: "invoice_1",
    status: "DRAFT",
    totalCents: 10000,
  });
  prismaMock.invoice.update = async (args: unknown) => {
    updateArgs = args;
  };

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "send" },
  );

  assert.deepEqual(result, { ok: true, status: "SENT" });
  assert.deepEqual(updateArgs, {
    where: { id: "invoice_1" },
    data: { status: "SENT" },
  });
});

test("updateInvoiceStatus rejects invalid and terminal transitions", async () => {
  let updateCalls = 0;

  prismaMock.invoice.findFirst = async () => ({
    id: "invoice_1",
    status: "PAID",
    totalCents: 10000,
  });
  prismaMock.invoice.update = async () => {
    updateCalls += 1;
  };

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "void" },
  );

  assert.deepEqual(result, { ok: false, reason: "invalidTransition" });
  assert.equal(updateCalls, 0);
});

test("calculateInvoicePaymentSummary totals paid and outstanding amounts", () => {
  assert.deepEqual(
    calculateInvoicePaymentSummary({
      totalCents: 10000,
      payments: [{ amountCents: 2500 }, { amountCents: 3000 }],
    }),
    {
      paidCents: 5500,
      outstandingCents: 4500,
      isPaid: false,
    },
  );
});

type PaymentTransactionMock = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
  payment: {
    aggregate: (args: unknown) => Promise<{ _sum: { amountCents: number | null } }>;
    create: (args: { data: unknown }) => Promise<unknown>;
  };
  invoice: {
    update: (args: unknown) => Promise<unknown>;
  };
};

const mockPaymentTransaction = ({
  invoice,
  paidCents = 0,
  onLockQuery,
  onPaymentCreate,
  onInvoiceUpdate,
}: {
  invoice: unknown;
  paidCents?: number;
  onLockQuery?: (strings: TemplateStringsArray, values: unknown[]) => void;
  onPaymentCreate?: (args: { data: unknown }) => void;
  onInvoiceUpdate?: (args: unknown) => void;
}) => {
  prismaMock.$transaction = async (callback: (tx: PaymentTransactionMock) => Promise<unknown>) =>
    callback({
      $queryRaw: async (strings, ...values) => {
        onLockQuery?.(strings, values);
        return invoice ? [invoice] : [];
      },
      payment: {
        async aggregate() {
          return { _sum: { amountCents: paidCents } };
        },
        async create(args) {
          onPaymentCreate?.(args);
          return { id: "payment_1" };
        },
      },
      invoice: {
        async update(args) {
          onInvoiceUpdate?.(args);
          return { id: "invoice_1" };
        },
      },
    });
};

test("recordInvoicePayment creates a partial payment and sets partially paid", async () => {
  let createdPaymentData: unknown;
  let updatedInvoiceData: unknown;
  const paidAt = new Date("2026-05-29T00:00:00.000Z");

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    paidCents: 2500,
    onPaymentCreate: (args) => {
      createdPaymentData = args.data;
    },
    onInvoiceUpdate: (args) => {
      updatedInvoiceData = args;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { amountCents: 3000, paidAt, reference: "BANK-123" },
  );

  assert.deepEqual(result, {
    ok: true,
    payment: { id: "payment_1" },
    status: "PARTIALLY_PAID",
    outstandingCents: 4500,
  });
  assert.deepEqual(createdPaymentData, {
    invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    amountCents: 3000,
    paidAt,
    reference: "BANK-123",
  });
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "PARTIALLY_PAID" },
  });
});

test("recordInvoicePayment marks an invoice paid when the balance is covered", async () => {
  let updatedInvoiceData: unknown;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "PARTIALLY_PAID",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    paidCents: 7000,
    onInvoiceUpdate: (args) => {
      updatedInvoiceData = args;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 3000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "PAID" },
  });
});

test("recordInvoicePayment keeps overdue invoices overdue when not fully paid", async () => {
  let updatedInvoiceData: unknown;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2000-06-27T00:00:00.000Z"),
    },
    paidCents: 0,
    onInvoiceUpdate: (args) => {
      updatedInvoiceData = args;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "OVERDUE" },
  });
});

test("recordInvoicePayment rejects overpayments without creating a payment", async () => {
  let paymentCreateCalls = 0;
  let invoiceUpdateCalls = 0;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    paidCents: 9000,
    onPaymentCreate: () => {
      paymentCreateCalls += 1;
    },
    onInvoiceUpdate: () => {
      invoiceUpdateCalls += 1;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1001,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "overpayment",
    outstandingCents: 1000,
  });
  assert.equal(paymentCreateCalls, 0);
  assert.equal(invoiceUpdateCalls, 0);
});

test("recordInvoicePayment rejects invoices that cannot accept payments", async () => {
  let paymentCreateCalls = 0;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "DRAFT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    onPaymentCreate: () => {
      paymentCreateCalls += 1;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.deepEqual(result, { ok: false, reason: "invalidStatus" });
  assert.equal(paymentCreateCalls, 0);
});

test("recordInvoicePayment rejects invoices outside the organization", async () => {
  mockPaymentTransaction({ invoice: null });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.deepEqual(result, { ok: false, reason: "notFound" });
});

test("recordInvoicePayment locks the invoice row scoped by organization", async () => {
  const organizationId = "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab";
  const invoiceId = "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c";
  let query = "";
  let queryValues: unknown[] = [];

  mockPaymentTransaction({
    invoice: {
      id: invoiceId,
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    onLockQuery: (strings, values) => {
      query = strings.join("?");
      queryValues = values;
    },
  });

  await recordInvoicePayment(organizationId, invoiceId, {
    amountCents: 1000,
    paidAt: new Date("2026-05-29T00:00:00.000Z"),
    reference: "",
  });

  assert.match(query, /FROM "Invoice"/);
  assert.match(query, /"id" = \?::uuid/);
  assert.match(query, /"organizationId" = \?::uuid/);
  assert.match(query, /FOR UPDATE/);
  assert.deepEqual(queryValues, [invoiceId, organizationId]);
});
