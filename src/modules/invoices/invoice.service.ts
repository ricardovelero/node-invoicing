import { prisma } from "../../db/prisma";
import { lineTotalCents } from "../../lib/money";
import type { InvoiceForm } from "./invoice.schema";
import { nextInvoiceNumber } from "./invoice-numbering";

export const getInvoices = (organizationId: string) =>
  prisma.invoice.findMany({
    where: { organizationId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

export const getInvoiceFormOptions = (organizationId: string) =>
  prisma.customer.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

export const createInvoiceRecord = async (organizationId: string, data: InvoiceForm) => {
  const customer = await prisma.customer.findFirst({
    where: {
      id: data.customerId,
      organizationId,
    },
    select: { id: true },
  });

  if (!customer) {
    return null;
  }

  const lines = data.lines.map((line) => {
    const unitPriceCents = Math.round(line.unitPrice * 100);
    const totalCents = lineTotalCents(line.quantity, unitPriceCents);

    return {
      description: line.description,
      quantity: line.quantity,
      unitPriceCents,
      totalCents,
    };
  });
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);
  const number = await nextInvoiceNumber(organizationId);

  return prisma.invoice.create({
    data: {
      organizationId,
      number,
      customerId: data.customerId,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
      lines: {
        create: lines,
      },
    },
  });
};
