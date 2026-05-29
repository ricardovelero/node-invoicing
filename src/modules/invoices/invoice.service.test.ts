import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import { createInvoiceRecord } from "./invoice.service";

const prismaMock = prisma as unknown as {
  customer: {
    findFirst: unknown;
  };
  invoice: {
    count: unknown;
    create: unknown;
  };
};

const originalFindFirst = prismaMock.customer.findFirst;
const originalCount = prismaMock.invoice.count;
const originalCreate = prismaMock.invoice.create;

afterEach(() => {
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.invoice.count = originalCount;
  prismaMock.invoice.create = originalCreate;
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
