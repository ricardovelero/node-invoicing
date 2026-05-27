import { prisma } from "../../db/prisma";
import { lineTotalCents } from "../../lib/money";
import type { InvoiceForm } from "./invoice.schema";
import { nextInvoiceNumber } from "./invoice-numbering";

export const getInvoices = () =>
  prisma.invoice.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

export const getInvoiceFormOptions = () =>
  prisma.customer.findMany({
    orderBy: { name: "asc" },
  });

export const createInvoiceRecord = async (data: InvoiceForm) => {
  const unitPriceCents = Math.round(data.unitPrice * 100);
  const totalCents = lineTotalCents(data.quantity, unitPriceCents);
  const number = await nextInvoiceNumber();

  return prisma.invoice.create({
    data: {
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
