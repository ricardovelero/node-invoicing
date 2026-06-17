import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createTranslator, loadTranslations, type Translate } from "../../lib/i18n";
import { getDashboardData } from "./dashboard.service";
import { renderDashboard } from "./dashboard.controller";

type MockRequest = Request & {
  auth: NonNullable<Request["auth"]>;
  t: Translate;
};

type MockResponse = Response & {
  renderedView?: string;
  renderedData?: Record<string, unknown>;
};

const organizationId = "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab";
const otherOrganizationId = "66e224e7-cd7a-4ea8-b095-78022090af69";

const prismaMock = prisma as unknown as {
  invoice: {
    count: unknown;
    findMany: unknown;
  };
  payment: {
    findMany: unknown;
  };
  invoiceEmailDelivery: {
    findMany: unknown;
  };
};

const originalInvoiceCount = prismaMock.invoice.count;
const originalInvoiceFindMany = prismaMock.invoice.findMany;
const originalPaymentFindMany = prismaMock.payment.findMany;
const originalInvoiceEmailDeliveryFindMany =
  prismaMock.invoiceEmailDelivery.findMany;
const t = createTranslator("en-GB", loadTranslations(), {
  environment: "test",
});

afterEach(() => {
  prismaMock.invoice.count = originalInvoiceCount;
  prismaMock.invoice.findMany = originalInvoiceFindMany;
  prismaMock.payment.findMany = originalPaymentFindMany;
  prismaMock.invoiceEmailDelivery.findMany =
    originalInvoiceEmailDeliveryFindMany;
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
        id: organizationId,
        name: "Analytical Engines",
        legalName: null,
        taxId: null,
        addressLine1: null,
        city: null,
        country: null,
        currency: "EUR",
        locale: "en-GB",
        paymentInstructions: null,
      },
      role: "OWNER",
    },
    t,
  }) as MockRequest;

const createResponse = () => {
  const res: {
    renderedView?: string;
    renderedData?: Record<string, unknown>;
    render?: (view: string, data: Record<string, unknown>) => MockResponse;
  } = {};

  res.render = (view, data) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

const invoiceBase = {
  customer: { name: "Live Ada Co" },
  snapshot: null,
  payments: [],
};

const createMockDashboardQueries = () => {
  const invoiceCountArgs: unknown[] = [];
  const invoiceFindManyArgs: unknown[] = [];
  const paymentFindManyArgs: unknown[] = [];
  const deliveryFindManyArgs: unknown[] = [];

  prismaMock.invoice.count = async (args: Record<string, unknown>) => {
    invoiceCountArgs.push(args);

    const where = args.where as Record<string, unknown>;
    const paymentStatus = where.paymentStatus;

    if ("dueDate" in where) {
      return 2;
    }

    if (where.status === "DRAFT") {
      return 1;
    }

    if (where.status === "ISSUED" && paymentStatus === "PARTIALLY_PAID") {
      return 2;
    }

    if (where.status === "ISSUED") {
      return 4;
    }

    if (paymentStatus === "UNPAID") {
      return 3;
    }

    if (paymentStatus === "PARTIALLY_PAID") {
      return 2;
    }

    if (paymentStatus === "PAID") {
      return 1;
    }

    return 0;
  };

  prismaMock.invoice.findMany = async (args: Record<string, unknown>) => {
    invoiceFindManyArgs.push(args);

    if ("select" in args) {
      return [
        {
          issueDate: new Date("2026-06-02T00:00:00.000Z"),
          totalCents: 10000,
          currency: "EUR",
        },
        {
          issueDate: new Date("2026-06-05T00:00:00.000Z"),
          totalCents: 12000,
          currency: "USD",
        },
        {
          issueDate: new Date("2026-05-10T00:00:00.000Z"),
          totalCents: 7000,
          currency: "EUR",
        },
      ];
    }

    const where = args.where as Record<string, unknown>;
    const status = where.status;
    const paymentStatus = where.paymentStatus;

    if (status === "ISSUED" && typeof paymentStatus === "object") {
      return [
        {
          ...invoiceBase,
          id: "overdue_effective",
          number: "INV-2026-0001",
          status: "ISSUED",
          paymentStatus: "UNPAID",
          dueDate: new Date("2026-06-01T00:00:00.000Z"),
          totalCents: 10000,
          currency: "EUR",
          payments: [{ amountCents: 2500 }],
        },
        {
          ...invoiceBase,
          id: "partial_invoice",
          number: "INV-2026-0002",
          status: "ISSUED",
          paymentStatus: "PARTIALLY_PAID",
          dueDate: new Date("2026-06-12T00:00:00.000Z"),
          totalCents: 15000,
          currency: "EUR",
          payments: [{ amountCents: 5000 }],
        },
        {
          ...invoiceBase,
          id: "usd_overdue",
          number: "INV-2026-0003",
          status: "ISSUED",
          paymentStatus: "PARTIALLY_PAID",
          dueDate: new Date("2026-05-20T00:00:00.000Z"),
          totalCents: 20000,
          currency: "USD",
          payments: [{ amountCents: 8000 }],
          snapshot: { customerName: "Snapshot USD Co" },
        },
      ];
    }

    if (status === "DRAFT") {
      return [
        {
          ...invoiceBase,
          id: "draft_invoice",
          number: "INV-2026-0004",
          status: "DRAFT",
          paymentStatus: "UNPAID",
          dueDate: new Date("2026-06-20T00:00:00.000Z"),
          createdAt: new Date("2026-06-08T00:00:00.000Z"),
          totalCents: 9000,
          currency: "EUR",
        },
      ];
    }

    if (status === "VOID") {
      return [
        {
          customer: { name: "Void Customer" },
          snapshot: null,
          id: "void_invoice",
          number: "INV-2026-0005",
          status: "VOID",
          paymentStatus: "UNPAID",
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
          totalCents: 11000,
          currency: "EUR",
        },
      ];
    }

    return [
      {
        customer: { name: "Live Ada Co" },
        snapshot: null,
        id: "created_invoice",
        number: "INV-2026-0006",
        status: "ISSUED",
        paymentStatus: "UNPAID",
        createdAt: new Date("2026-06-06T00:00:00.000Z"),
        totalCents: 13000,
        currency: "EUR",
      },
    ];
  };

  prismaMock.payment.findMany = async (args: Record<string, unknown>) => {
    paymentFindManyArgs.push(args);

    if ("select" in args) {
      return [
        {
          paidAt: new Date("2026-06-03T00:00:00.000Z"),
          amountCents: 6000,
          invoice: { currency: "EUR" },
        },
        {
          paidAt: new Date("2026-06-05T00:00:00.000Z"),
          amountCents: 4000,
          invoice: { currency: "USD" },
        },
      ];
    }

    return [
      {
        createdAt: new Date("2026-06-04T00:00:00.000Z"),
        amountCents: 6000,
        invoice: {
          customer: { name: "Payment Customer" },
          snapshot: null,
          id: "payment_invoice",
          number: "INV-2026-0007",
          status: "ISSUED",
          paymentStatus: "PARTIALLY_PAID",
          totalCents: 16000,
          currency: "EUR",
        },
      },
    ];
  };

  prismaMock.invoiceEmailDelivery.findMany = async (
    args: Record<string, unknown>,
  ) => {
    deliveryFindManyArgs.push(args);

    return [
      {
        sentAt: new Date("2026-06-05T00:00:00.000Z"),
        createdAt: new Date("2026-06-05T00:00:00.000Z"),
        invoice: {
          customer: { name: "Email Customer" },
          snapshot: null,
          id: "sent_invoice",
          number: "INV-2026-0008",
          status: "ISSUED",
          paymentStatus: "UNPAID",
          totalCents: 17000,
          currency: "EUR",
        },
      },
    ];
  };

  return {
    invoiceCountArgs,
    invoiceFindManyArgs,
    paymentFindManyArgs,
    deliveryFindManyArgs,
  };
};

test("renderDashboard exposes practical dashboard sections", async () => {
  createMockDashboardQueries();
  const res = createResponse();

  await renderDashboard(createRequest(), res, () => undefined);

  assert.equal(res.renderedView, "pages/dashboard.njk");
  assert.equal(res.renderedData?.title, "Dashboard");
  assert.ok(res.renderedData?.metrics);
  assert.ok(res.renderedData?.quickActions);
  assert.ok(res.renderedData?.attentionSections);
  assert.ok(res.renderedData?.monthlySeries);
  assert.ok(res.renderedData?.recentActivity);
  assert.equal("statusCards" in res.renderedData!, false);
});

test("getDashboardData scopes queries, groups currencies, and subtracts payments", async () => {
  const {
    invoiceCountArgs,
    invoiceFindManyArgs,
    paymentFindManyArgs,
    deliveryFindManyArgs,
  } = createMockDashboardQueries();

  const data = await getDashboardData(
    organizationId,
    "EUR",
    "en-GB",
    new Date("2026-06-08T12:00:00.000Z"),
  );

  for (const args of invoiceCountArgs) {
    const where = (args as { where: Record<string, unknown> }).where;
    assert.equal(where.organizationId, organizationId);
    assert.notEqual(where.organizationId, otherOrganizationId);
  }

  for (const args of invoiceFindManyArgs) {
    const where = (args as { where: Record<string, unknown> }).where;
    assert.equal(where.organizationId, organizationId);
    assert.notEqual(where.organizationId, otherOrganizationId);
  }

  for (const args of paymentFindManyArgs) {
    const where = (args as { where: { invoice: { organizationId: string } } }).where;
    assert.equal(where.invoice.organizationId, organizationId);
  }

  for (const args of deliveryFindManyArgs) {
    const where = (args as { where: Record<string, unknown> }).where;
    assert.equal(where.organizationId, organizationId);
  }

  assert.deepEqual(data.metrics.totalInvoicedThisMonth, [
    { currency: "EUR", totalCents: 10000 },
    { currency: "USD", totalCents: 12000 },
  ]);
  assert.deepEqual(data.metrics.paidThisMonth, [
    { currency: "EUR", totalCents: 6000 },
    { currency: "USD", totalCents: 4000 },
  ]);
  assert.deepEqual(data.metrics.outstandingBalance, [
    { currency: "EUR", totalCents: 17500 },
    { currency: "USD", totalCents: 12000 },
  ]);
  assert.deepEqual(data.metrics.overdueAmount, [
    { currency: "EUR", totalCents: 7500 },
    { currency: "USD", totalCents: 12000 },
  ]);
  assert.equal(data.quickActions[2].href, "/invoices/overdue_effective");
  assert.equal(
    data.quickActions[2].descriptionKey,
    "dashboard.quickActions.recordPayment.targetDescription",
  );
  assert.deepEqual(data.quickActions[2].descriptionParams, {
    invoiceNumber: "INV-2026-0001",
  });
  assert.equal(
    data.attentionSections[0].titleKey,
    "dashboard.attention.overdue.title",
  );
  assert.equal(data.attentionSections[0].rows[0].id, "usd_overdue");
  assert.equal(data.attentionSections[0].count, 2);
  assert.deepEqual(data.attentionSections[0].rows[0].statusBadges, [
    {
      label: "Partially paid",
      labelKey: "invoices.paymentStatuses.partially_paid",
      variant: "warning",
    },
  ]);
  assert.deepEqual(data.attentionSections[0].rows[1].statusBadges, []);
  assert.equal(data.attentionSections[1].rows[0].id, "partial_invoice");
  assert.equal(data.attentionSections[1].count, 1);
  assert.deepEqual(data.attentionSections[1].rows[0].statusBadges, []);
  assert.equal(data.attentionSections[2].rows[0].id, "draft_invoice");
  assert.equal(data.attentionSections[2].count, 1);
  assert.deepEqual(data.attentionSections[2].rows[0].statusBadges, []);
  assert.equal(data.attentionSections[3].rows[0].id, "usd_overdue");
  assert.equal(data.attentionSections[3].count, 2);
  assert.deepEqual(data.attentionSections[3].rows[0].statusBadges, [
    {
      label: "Overdue",
      labelKey: "invoices.statuses.overdue",
      variant: "danger",
    },
  ]);
  assert.deepEqual(data.attentionSections[3].rows[1].statusBadges, []);
  assert.equal("statusCards" in data, false);
  assert.equal(data.monthlySeries.length, 6);
  assert.ok(data.recentActivity.some((activity) => activity.type === "payment"));
});

test("getDashboardData falls back to organization currency for empty totals", async () => {
  prismaMock.invoice.count = async () => 0;
  prismaMock.invoice.findMany = async () => [];
  prismaMock.payment.findMany = async () => [];
  prismaMock.invoiceEmailDelivery.findMany = async () => [];

  const data = await getDashboardData(
    organizationId,
    "EUR",
    "en-GB",
    new Date("2026-06-08T12:00:00.000Z"),
  );

  assert.deepEqual(data.metrics.totalInvoicedThisMonth, [
    { currency: "EUR", totalCents: 0 },
  ]);
  assert.deepEqual(data.metrics.paidThisMonth, [
    { currency: "EUR", totalCents: 0 },
  ]);
  assert.deepEqual(data.metrics.outstandingBalance, [
    { currency: "EUR", totalCents: 0 },
  ]);
  assert.deepEqual(data.metrics.overdueAmount, [
    { currency: "EUR", totalCents: 0 },
  ]);
});
