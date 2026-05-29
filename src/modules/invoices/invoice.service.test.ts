import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  createInvoiceRecord,
  getInvoiceDetails,
  updateInvoiceStatus,
} from "./invoice.service";

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  customer: {
    findFirst: unknown;
  };
  invoice: {
    count: unknown;
    create: unknown;
    findFirst: unknown;
    findMany: unknown;
    update: unknown;
  };
};

const originalTransaction = prismaMock.$transaction;
const originalFindFirst = prismaMock.customer.findFirst;
const originalCount = prismaMock.invoice.count;
const originalCreate = prismaMock.invoice.create;
const originalInvoiceFindFirst = prismaMock.invoice.findFirst;
const originalInvoiceFindMany = prismaMock.invoice.findMany;
const originalInvoiceUpdate = prismaMock.invoice.update;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.invoice.count = originalCount;
  prismaMock.invoice.create = originalCreate;
  prismaMock.invoice.findFirst = originalInvoiceFindFirst;
  prismaMock.invoice.findMany = originalInvoiceFindMany;
  prismaMock.invoice.update = originalInvoiceUpdate;
});

test("createInvoiceRecord creates multiple lines and sums invoice totals", async () => {
  let createdInvoiceData: unknown;

  prismaMock.customer.findFirst = async () => ({ id: "customer_1" });
  prismaMock.invoice.count = async () => 0;
  prismaMock.invoice.create = async (args: { data: unknown }) => {
    createdInvoiceData = args.data;
    return { id: "invoice_1" };
  };

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
    { action: "send", paidAt: undefined, reference: "" },
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
    { action: "void", paidAt: undefined, reference: "" },
  );

  assert.deepEqual(result, { ok: false, reason: "invalidTransition" });
  assert.equal(updateCalls, 0);
});

test("updateInvoiceStatus creates a full-total payment when marking paid", async () => {
  let createdPaymentData: unknown;
  let updatedInvoiceData: unknown;
  const paidAt = new Date("2026-05-29T00:00:00.000Z");

  prismaMock.invoice.findFirst = async () => ({
    id: "invoice_1",
    status: "SENT",
    totalCents: 31271,
  });
  prismaMock.$transaction = async (
    callback: (tx: {
      payment: { create: (args: { data: unknown }) => Promise<void> };
      invoice: { update: (args: { data: unknown }) => Promise<void> };
    }) => Promise<void>,
  ) =>
    callback({
      payment: {
        async create(args) {
          createdPaymentData = args.data;
        },
      },
      invoice: {
        async update(args) {
          updatedInvoiceData = args;
        },
      },
    });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "markPaid", paidAt, reference: "BANK-123" },
  );

  assert.deepEqual(result, { ok: true, status: "PAID" });
  assert.deepEqual(createdPaymentData, {
    invoiceId: "invoice_1",
    amountCents: 31271,
    paidAt,
    reference: "BANK-123",
  });
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "invoice_1" },
    data: { status: "PAID" },
  });
});
