import type { RequestHandler } from "express";
import { prisma } from "../../db/prisma";
import { createInvoiceTableRows } from "../invoices/invoice.presenter";

export const renderDashboard: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organization.id;

  const [customerCount, invoiceCount, openBalances, latestInvoices] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.invoice.count({ where: { organizationId } }),
    prisma.invoice.groupBy({
      by: ["currency"],
      where: {
        organizationId,
        status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _sum: { totalCents: true },
    }),
    prisma.invoice.findMany({
      where: { organizationId },
      include: { customer: true, snapshot: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  res.render("pages/dashboard.njk", {
    title: "Dashboard",
    metrics: {
      customerCount,
      invoiceCount,
      openBalanceCents: openBalances.length === 1 ? openBalances[0]._sum.totalCents ?? 0 : 0,
      openBalanceCurrency: openBalances[0]?.currency ?? req.auth!.organization.currency,
      openBalanceIsMixedCurrency: openBalances.length > 1,
    },
    latestInvoiceRows: createInvoiceTableRows(latestInvoices),
  });
};
