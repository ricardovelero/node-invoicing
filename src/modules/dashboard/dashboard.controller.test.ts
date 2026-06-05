import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { renderDashboard } from "./dashboard.controller";

type MockRequest = Request & {
  auth: NonNullable<Request["auth"]>;
};

type MockResponse = Response & {
  renderedView?: string;
  renderedData?: {
    title: string;
    metrics: {
      customerCount: number;
      invoiceCount: number;
      openBalances: { currency: string; totalCents: number }[];
    };
    latestInvoiceRows: unknown[];
  };
};

const prismaMock = prisma as unknown as {
  customer: {
    count: unknown;
  };
  invoice: {
    count: unknown;
    groupBy: unknown;
    findMany: unknown;
  };
};

const originalCustomerCount = prismaMock.customer.count;
const originalInvoiceCount = prismaMock.invoice.count;
const originalInvoiceGroupBy = prismaMock.invoice.groupBy;
const originalInvoiceFindMany = prismaMock.invoice.findMany;

afterEach(() => {
  prismaMock.customer.count = originalCustomerCount;
  prismaMock.invoice.count = originalInvoiceCount;
  prismaMock.invoice.groupBy = originalInvoiceGroupBy;
  prismaMock.invoice.findMany = originalInvoiceFindMany;
});

const createRequest = () =>
  ({
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
        locale: "es-ES",
        paymentInstructions: null,
      },
      role: "OWNER",
    },
  }) as MockRequest;

const createResponse = () => {
  const res: {
    renderedView?: string;
    renderedData?: MockResponse["renderedData"];
    render?: (view: string, data: MockResponse["renderedData"]) => MockResponse;
  } = {};

  res.render = (view, data) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

const mockDashboardQueries = (openBalances: unknown[]) => {
  prismaMock.customer.count = async () => 2;
  prismaMock.invoice.count = async () => 3;
  prismaMock.invoice.groupBy = async () => openBalances;
  prismaMock.invoice.findMany = async () => [
    {
      id: "invoice_1",
      number: "INV-2026-0001",
      status: "PARTIALLY_PAID",
      dueDate: new Date("2026-06-29T00:00:00.000Z"),
      totalCents: 10000,
      currency: "EUR",
      customer: { name: "Live Ada Co" },
      snapshot: { customerName: "Snapshot Ada Co" },
    },
  ];
};

test("renderDashboard exposes a single-currency open balance", async () => {
  mockDashboardQueries([{ currency: "GBP", _sum: { totalCents: 12345 } }]);
  const res = createResponse();

  await renderDashboard(createRequest(), res, () => undefined);

  assert.equal(res.renderedView, "pages/dashboard.njk");
  assert.deepEqual(res.renderedData?.metrics, {
    customerCount: 2,
    invoiceCount: 3,
    openBalances: [{ currency: "GBP", totalCents: 12345 }],
  });
  assert.deepEqual(res.renderedData?.latestInvoiceRows, [
    {
      id: "invoice_1",
      number: "INV-2026-0001",
      status: "PARTIALLY_PAID",
      dueDate: new Date("2026-06-29T00:00:00.000Z"),
      totalCents: 10000,
      currency: "EUR",
      customer: { name: "Live Ada Co" },
      snapshot: { customerName: "Snapshot Ada Co" },
      customerName: "Snapshot Ada Co",
      statusBadge: {
        label: "Partially paid",
        variant: "warning",
      },
    },
  ]);
});

test("renderDashboard exposes mixed-currency open balances by currency", async () => {
  mockDashboardQueries([
    { currency: "USD", _sum: { totalCents: 20000 } },
    { currency: "EUR", _sum: { totalCents: 10000 } },
  ]);
  const res = createResponse();

  await renderDashboard(createRequest(), res, () => undefined);

  assert.deepEqual(res.renderedData?.metrics, {
    customerCount: 2,
    invoiceCount: 3,
    openBalances: [
      { currency: "EUR", totalCents: 10000 },
      { currency: "USD", totalCents: 20000 },
    ],
  });
});

test("renderDashboard falls back to organization currency when no open balance exists", async () => {
  mockDashboardQueries([]);
  const res = createResponse();

  await renderDashboard(createRequest(), res, () => undefined);

  assert.deepEqual(res.renderedData?.metrics, {
    customerCount: 2,
    invoiceCount: 3,
    openBalances: [{ currency: "EUR", totalCents: 0 }],
  });
});
