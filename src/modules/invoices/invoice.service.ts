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

  const unitPriceCents = Math.round(data.unitPrice * 100);
  const totalCents = lineTotalCents(data.quantity, unitPriceCents);
  const number = await nextInvoiceNumber(organizationId);

  return prisma.invoice.create({
    data: {
      organizationId,
      number,
      customerId: data.customerId,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      subtotalCents: totalCents,
      taxCents: 0,
      totalCents,
      lines: {
        create: {
          description: data.lineDescription,
          quantity: data.quantity,
          unitPriceCents,
          totalCents,
        },
      },
    },
  });
};
