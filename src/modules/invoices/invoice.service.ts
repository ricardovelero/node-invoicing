import { prisma } from "../../db/prisma";
import { calculateInvoiceTotals } from "../../lib/money";
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

  const totals = calculateInvoiceTotals(
    data.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: {
        type: line.discountType,
        value: line.discountValue,
      },
      taxRate: line.taxRate,
    })),
    {
      type: data.invoiceDiscountType,
      value: data.invoiceDiscountValue,
    },
  );
  const number = await nextInvoiceNumber(organizationId);

  return prisma.invoice.create({
    data: {
      organizationId,
      number,
      customerId: data.customerId,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      notes: data.notes || null,
      lines: {
        create: data.lines.map((line, index) => {
          const calculatedLine = totals.lines[index];

          return {
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: calculatedLine.unitPriceCents,
            discountCents: calculatedLine.discountCents,
            invoiceDiscountCents: calculatedLine.invoiceDiscountCents,
            taxRateBps: calculatedLine.taxRateBps,
            taxCents: calculatedLine.taxCents,
            totalCents: calculatedLine.totalCents,
          };
        }),
      },
    },
  });
};
