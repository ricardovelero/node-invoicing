import type { RequestHandler } from "express";
import { prisma } from "../../db/prisma";

export const renderDashboard: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organization.id;

  const [customerCount, invoiceCount, openInvoices, latestInvoices] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.invoice.count({ where: { organizationId } }),
    prisma.invoice.aggregate({
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
      openBalanceCents: openInvoices._sum.totalCents ?? 0,
    },
    latestInvoices,
  });
};
