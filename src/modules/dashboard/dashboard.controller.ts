import type { RequestHandler } from "express";
import { prisma } from "../../db/prisma";
import { createInvoiceTableRows } from "../invoices/invoice.presenter";

export const renderDashboard: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organization.id;

  const [customerCount, invoiceCount, openBalanceGroups, latestInvoices] = await Promise.all([
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

  const openBalances =
    openBalanceGroups.length > 0
      ? openBalanceGroups
          .map((balance) => ({
            currency: balance.currency,
            totalCents: balance._sum.totalCents ?? 0,
          }))
          .sort((left, right) => left.currency.localeCompare(right.currency))
      : [{ currency: req.auth!.organization.currency, totalCents: 0 }];

  res.render("pages/dashboard.njk", {
    title: "Dashboard",
    metrics: {
      customerCount,
      invoiceCount,
      openBalances,
    },
    latestInvoiceRows: createInvoiceTableRows(latestInvoices),
  });
};
