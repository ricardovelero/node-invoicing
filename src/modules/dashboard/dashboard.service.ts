import type { InvoiceStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  createInvoiceOverdueBadge,
  createInvoicePaymentStatusBadge,
} from "../invoices/invoice.presenter";
import { isInvoiceOverdue } from "../invoices/invoice.service";

type MoneyTotal = {
  currency: string;
  totalCents: number;
};

type InvoiceWithPayments = {
  id: string;
  number: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  dueDate: Date;
  totalCents: number;
  currency: string;
  customer: {
    name: string;
  };
  snapshot: {
    customerName: string;
  } | null;
  payments: Array<{
    amountCents: number;
  }>;
};

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toDateOnlyTime = (date: Date) =>
  startOfDay(date).getTime();

const createEmptyMoneyTotal = (organizationCurrency: string): MoneyTotal[] => [
  { currency: organizationCurrency, totalCents: 0 },
];

const sortMoneyTotals = (totals: MoneyTotal[]) =>
  totals.sort((left, right) => left.currency.localeCompare(right.currency));

const moneyTotalsFromMap = (
  totalsByCurrency: Map<string, number>,
  organizationCurrency: string,
) => {
  const totals = Array.from(totalsByCurrency.entries())
    .map(([currency, totalCents]) => ({ currency, totalCents }))
    .filter((total) => total.totalCents !== 0);

  return totals.length > 0
    ? sortMoneyTotals(totals)
    : createEmptyMoneyTotal(organizationCurrency);
};

const addMoneyTotal = (
  totalsByCurrency: Map<string, number>,
  currency: string,
  amountCents: number,
) => {
  totalsByCurrency.set(
    currency,
    (totalsByCurrency.get(currency) ?? 0) + amountCents,
  );
};

const paidCentsForInvoice = (invoice: Pick<InvoiceWithPayments, "payments">) =>
  invoice.payments.reduce((total, payment) => total + payment.amountCents, 0);

const outstandingCentsForInvoice = (
  invoice: Pick<InvoiceWithPayments, "payments" | "totalCents">,
) => Math.max(invoice.totalCents - paidCentsForInvoice(invoice), 0);

const customerNameForInvoice = (
  invoice: Pick<InvoiceWithPayments, "customer" | "snapshot" | "status">,
) =>
  invoice.status !== "DRAFT" && invoice.snapshot
    ? invoice.snapshot.customerName
    : invoice.customer.name;

type AttentionBadge = ReturnType<
  typeof createInvoiceOverdueBadge | typeof createInvoicePaymentStatusBadge
>;

const createAttentionInvoiceRow = (
  invoice: InvoiceWithPayments,
  statusBadges: AttentionBadge[] = [],
) => ({
  id: invoice.id,
  number: invoice.number,
  customerName: customerNameForInvoice(invoice),
  dueDate: invoice.dueDate,
  status: invoice.status,
  statusBadge: statusBadges[0],
  statusBadges,
  currency: invoice.currency,
  outstandingCents:
    invoice.status === "DRAFT"
      ? invoice.totalCents
      : outstandingCentsForInvoice(invoice),
});

const byDueDateAscending = (left: InvoiceWithPayments, right: InvoiceWithPayments) =>
  left.dueDate.getTime() - right.dueDate.getTime();

const byCreatedAtDescending = <Item extends { createdAt: Date }>(
  left: Item,
  right: Item,
) => right.createdAt.getTime() - left.createdAt.getTime();

const calculateBarWidth = (amountCents: number, maxAmountCents: number) => {
  if (amountCents <= 0 || maxAmountCents <= 0) {
    return 0;
  }

  return Math.max(Math.round((amountCents / maxAmountCents) * 100), 2);
};

const createMonthlySeries = ({
  invoices,
  payments,
  organizationCurrency,
  organizationLocale,
  recentStart,
  monthCount,
}: {
  invoices: Array<{
    issueDate: Date;
    totalCents: number;
    currency: string;
  }>;
  payments: Array<{
    paidAt: Date;
    amountCents: number;
    invoice: {
      currency: string;
    };
  }>;
  organizationCurrency: string;
  organizationLocale: string;
  recentStart: Date;
  monthCount: number;
}) => {
  const monthFormatter = new Intl.DateTimeFormat(organizationLocale, {
    month: "short",
    year: "numeric",
  });
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = addMonths(recentStart, index);

    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      date,
      label: monthFormatter.format(date),
      invoicedTotalsByCurrency: new Map<string, number>(),
      paidTotalsByCurrency: new Map<string, number>(),
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  for (const invoice of invoices) {
    const key = `${invoice.issueDate.getFullYear()}-${String(
      invoice.issueDate.getMonth() + 1,
    ).padStart(2, "0")}`;
    const month = monthByKey.get(key);

    if (month) {
      addMoneyTotal(
        month.invoicedTotalsByCurrency,
        invoice.currency,
        invoice.totalCents,
      );
    }
  }

  for (const payment of payments) {
    const key = `${payment.paidAt.getFullYear()}-${String(
      payment.paidAt.getMonth() + 1,
    ).padStart(2, "0")}`;
    const month = monthByKey.get(key);

    if (month) {
      addMoneyTotal(
        month.paidTotalsByCurrency,
        payment.invoice.currency,
        payment.amountCents,
      );
    }
  }

  const maxMonthlyAmount = Math.max(
    ...months.flatMap((month) => [
      ...month.invoicedTotalsByCurrency.values(),
      ...month.paidTotalsByCurrency.values(),
    ]),
    0,
  );

  return months.map((month) => {
    const primaryInvoicedCents =
      month.invoicedTotalsByCurrency.get(organizationCurrency) ??
      Math.max(...month.invoicedTotalsByCurrency.values(), 0);
    const primaryPaidCents =
      month.paidTotalsByCurrency.get(organizationCurrency) ??
      Math.max(...month.paidTotalsByCurrency.values(), 0);

    return {
      label: month.label,
      invoicedTotals: moneyTotalsFromMap(
        month.invoicedTotalsByCurrency,
        organizationCurrency,
      ),
      paidTotals: moneyTotalsFromMap(
        month.paidTotalsByCurrency,
        organizationCurrency,
      ),
      invoicedBarWidth: calculateBarWidth(
        primaryInvoicedCents,
        maxMonthlyAmount,
      ),
      paidBarWidth: calculateBarWidth(primaryPaidCents, maxMonthlyAmount),
    };
  });
};

export const getDashboardData = async (
  organizationId: string,
  organizationCurrency: string,
  organizationLocale: string,
  now = new Date(),
) => {
  const today = startOfDay(now);
  const currentMonthStart = startOfMonth(today);
  const nextMonthStart = addMonths(currentMonthStart, 1);
  const recentMonthCount = 6;
  const recentStart = addMonths(currentMonthStart, -(recentMonthCount - 1));
  const dueSoonEnd = addDays(today, 8);
  const overdueWhere = {
    organizationId,
    status: "ISSUED" as const,
    paymentStatus: { not: "PAID" as const },
    dueDate: { lt: today },
  };

  const [
    draftInvoiceCount,
    partiallyPaidInvoiceCount,
    overdueInvoiceCount,
    recentInvoices,
    recentPayments,
    openInvoices,
    draftInvoices,
    recentCreatedInvoices,
    recentSentDeliveries,
    recentRecordedPayments,
    recentVoidedInvoices,
  ] = await Promise.all([
    prisma.invoice.count({
      where: {
        organizationId,
        status: "DRAFT",
      },
    }),
    prisma.invoice.count({
      where: {
        organizationId,
        status: "ISSUED",
        paymentStatus: "PARTIALLY_PAID",
      },
    }),
    prisma.invoice.count({
      where: overdueWhere,
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "ISSUED",
        issueDate: {
          gte: recentStart,
          lt: nextMonthStart,
        },
      },
      select: {
        issueDate: true,
        totalCents: true,
        currency: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: {
          gte: recentStart,
          lt: nextMonthStart,
        },
        invoice: {
          organizationId,
        },
      },
      select: {
        paidAt: true,
        amountCents: true,
        invoice: {
          select: {
            currency: true,
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "ISSUED",
        paymentStatus: { not: "PAID" },
      },
      include: {
        customer: true,
        snapshot: true,
        payments: true,
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "DRAFT",
      },
      include: {
        customer: true,
        snapshot: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.invoice.findMany({
      where: { organizationId },
      include: {
        customer: true,
        snapshot: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.invoiceEmailDelivery.findMany({
      where: {
        organizationId,
        status: { in: ["SENT", "DELIVERED"] },
      },
      include: {
        invoice: {
          include: {
            customer: true,
            snapshot: true,
          },
        },
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.payment.findMany({
      where: {
        invoice: {
          organizationId,
        },
      },
      include: {
        invoice: {
          include: {
            customer: true,
            snapshot: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: "VOID",
      },
      include: {
        customer: true,
        snapshot: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const totalInvoicedThisMonthByCurrency = new Map<string, number>();
  const paidThisMonthByCurrency = new Map<string, number>();
  const outstandingBalanceByCurrency = new Map<string, number>();
  const overdueAmountByCurrency = new Map<string, number>();

  for (const invoice of recentInvoices) {
    if (
      invoice.issueDate >= currentMonthStart &&
      invoice.issueDate < nextMonthStart
    ) {
      addMoneyTotal(
        totalInvoicedThisMonthByCurrency,
        invoice.currency,
        invoice.totalCents,
      );
    }
  }

  for (const payment of recentPayments) {
    if (payment.paidAt >= currentMonthStart && payment.paidAt < nextMonthStart) {
      addMoneyTotal(
        paidThisMonthByCurrency,
        payment.invoice.currency,
        payment.amountCents,
      );
    }
  }

  for (const invoice of openInvoices) {
    const outstandingCents = outstandingCentsForInvoice(invoice);

    addMoneyTotal(
      outstandingBalanceByCurrency,
      invoice.currency,
      outstandingCents,
    );

    if (isInvoiceOverdue(invoice, today)) {
      addMoneyTotal(
        overdueAmountByCurrency,
        invoice.currency,
        outstandingCents,
      );
    }
  }

  const overdueInvoiceRows = openInvoices.filter((invoice) =>
    isInvoiceOverdue(invoice, today),
  );
  const dueSoonInvoiceRows = openInvoices.filter((invoice) => {
    const dueTime = toDateOnlyTime(invoice.dueDate);

    return (
      !isInvoiceOverdue(invoice, today) &&
      dueTime >= toDateOnlyTime(today) &&
      dueTime < toDateOnlyTime(dueSoonEnd)
    );
  });
  const partiallyPaidInvoiceRows = openInvoices.filter((invoice) => {
    const paidCents = paidCentsForInvoice(invoice);
    const outstandingCents = outstandingCentsForInvoice(invoice);

    return (
      invoice.paymentStatus === "PARTIALLY_PAID" &&
      paidCents > 0 &&
      outstandingCents > 0
    );
  });

  const overdueInvoices = overdueInvoiceRows
    .sort(byDueDateAscending)
    .slice(0, 5)
    .map((invoice) =>
      createAttentionInvoiceRow(
        invoice,
        invoice.paymentStatus === "PARTIALLY_PAID"
          ? [createInvoicePaymentStatusBadge("PARTIALLY_PAID")]
          : [],
      ),
    );
  const dueSoonInvoices = dueSoonInvoiceRows
    .sort(byDueDateAscending)
    .slice(0, 5)
    .map((invoice) => createAttentionInvoiceRow(invoice));
  const partiallyPaidInvoices = partiallyPaidInvoiceRows
    .sort(byDueDateAscending)
    .slice(0, 5)
    .map((invoice) =>
      createAttentionInvoiceRow(
        invoice,
        isInvoiceOverdue(invoice, today) ? [createInvoiceOverdueBadge()] : [],
      ),
    );
  const draftRows = draftInvoices
    .sort(byCreatedAtDescending)
    .slice(0, 5)
    .map((invoice) => createAttentionInvoiceRow(invoice));

  const paymentTarget = openInvoices.find(
    (invoice) => outstandingCentsForInvoice(invoice) > 0,
  );
  const recordPaymentHref = paymentTarget
    ? `/invoices/${paymentTarget.id}`
    : "/invoices?status=issued&paymentStatus=unpaid";

  const recentActivity = [
    ...recentCreatedInvoices.map((invoice) => ({
      type: "created",
      occurredAt: invoice.createdAt,
      href: `/invoices/${invoice.id}`,
      invoiceNumber: invoice.number,
      customerName: customerNameForInvoice(invoice),
      currency: invoice.currency,
      amountCents: invoice.totalCents,
    })),
    ...recentSentDeliveries.map((delivery) => ({
      type: "sent",
      occurredAt: delivery.sentAt ?? delivery.createdAt,
      href: `/invoices/${delivery.invoice.id}`,
      invoiceNumber: delivery.invoice.number,
      customerName: customerNameForInvoice(delivery.invoice),
      currency: delivery.invoice.currency,
      amountCents: delivery.invoice.totalCents,
    })),
    ...recentRecordedPayments.map((payment) => ({
      type: "payment",
      occurredAt: payment.createdAt,
      href: `/invoices/${payment.invoice.id}`,
      invoiceNumber: payment.invoice.number,
      customerName: customerNameForInvoice(payment.invoice),
      currency: payment.invoice.currency,
      amountCents: payment.amountCents,
    })),
    ...recentVoidedInvoices.map((invoice) => ({
      type: "voided",
      occurredAt: invoice.updatedAt,
      href: `/invoices/${invoice.id}`,
      invoiceNumber: invoice.number,
      customerName: customerNameForInvoice(invoice),
      currency: invoice.currency,
      amountCents: invoice.totalCents,
    })),
  ]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 10);

  return {
    metrics: {
      totalInvoicedThisMonth: moneyTotalsFromMap(
        totalInvoicedThisMonthByCurrency,
        organizationCurrency,
      ),
      paidThisMonth: moneyTotalsFromMap(
        paidThisMonthByCurrency,
        organizationCurrency,
      ),
      outstandingBalance: moneyTotalsFromMap(
        outstandingBalanceByCurrency,
        organizationCurrency,
      ),
      overdueAmount: moneyTotalsFromMap(
        overdueAmountByCurrency,
        organizationCurrency,
      ),
    },
    quickActions: [
      {
        labelKey: "dashboard.quickActions.newInvoice.label",
        descriptionKey: "dashboard.quickActions.newInvoice.description",
        href: "/invoices/new",
        variant: "primary",
      },
      {
        labelKey: "dashboard.quickActions.newCustomer.label",
        descriptionKey: "dashboard.quickActions.newCustomer.description",
        href: "/customers/new",
        variant: "secondary",
      },
      {
        labelKey: "dashboard.quickActions.recordPayment.label",
        descriptionKey: paymentTarget
          ? "dashboard.quickActions.recordPayment.targetDescription"
          : "dashboard.quickActions.recordPayment.fallbackDescription",
        descriptionParams: paymentTarget
          ? { invoiceNumber: paymentTarget.number }
          : {},
        href: recordPaymentHref,
        variant: "secondary",
      },
      {
        labelKey: "dashboard.quickActions.viewOverdueInvoices.label",
        descriptionKey: "dashboard.quickActions.viewOverdueInvoices.description",
        href: "/invoices?overdue=overdue",
        variant: "secondary",
      },
    ],
    attentionSections: [
      {
        titleKey: "dashboard.attention.overdue.title",
        emptyMessageKey: "dashboard.attention.overdue.empty",
        href: "/invoices?overdue=overdue",
        count: overdueInvoiceCount,
        rows: overdueInvoices,
      },
      {
        titleKey: "dashboard.attention.dueSoon.title",
        emptyMessageKey: "dashboard.attention.dueSoon.empty",
        href: "/invoices?status=issued&paymentStatus=unpaid",
        count: dueSoonInvoiceRows.length,
        rows: dueSoonInvoices,
      },
      {
        titleKey: "dashboard.attention.drafts.title",
        emptyMessageKey: "dashboard.attention.drafts.empty",
        href: "/invoices?status=draft",
        count: draftInvoiceCount,
        rows: draftRows,
      },
      {
        titleKey: "dashboard.attention.partiallyPaid.title",
        emptyMessageKey: "dashboard.attention.partiallyPaid.empty",
        href: "/invoices?paymentStatus=partially_paid",
        count: partiallyPaidInvoiceCount,
        rows: partiallyPaidInvoices,
      },
    ],
    monthlySeries: createMonthlySeries({
      invoices: recentInvoices,
      payments: recentPayments,
      organizationCurrency,
      organizationLocale,
      recentStart,
      monthCount: recentMonthCount,
    }),
    recentActivity,
  };
};
