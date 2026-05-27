import type { RequestHandler } from "express";
import { prisma } from "../../db/prisma";

export const renderDashboard: RequestHandler = async (_req, res) => {
  const [customerCount, invoiceCount, openInvoices, latestInvoices] = await Promise.all([
    prisma.customer.count(),
    prisma.invoice.count(),
    prisma.invoice.aggregate({
      where: { status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
      _sum: { totalCents: true },
    }),
    prisma.invoice.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  res.render("pages/dashboard.njk", {
    title: "Dashboard",
    metrics: {
      customerCount,
      invoiceCount,
      openBalanceCents: openInvoices._sum.totalCents ?? 0,
    },
    latestInvoices,
  });
};
