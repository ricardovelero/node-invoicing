import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { calculateInvoiceTotals } from "../../lib/money";
import type { InvoiceForm, InvoiceStatusActionForm } from "./invoice.schema";
import { nextInvoiceNumber } from "./invoice-numbering";

export type InvoiceStatusAction = InvoiceStatusActionForm["action"];

const statusActionTargets: Partial<Record<InvoiceStatusAction, InvoiceStatus>> = {
  send: "SENT",
  markOverdue: "OVERDUE",
  markPaid: "PAID",
  void: "VOID",
};

const allowedStatusActions: Record<InvoiceStatus, InvoiceStatusAction[]> = {
  DRAFT: ["send", "void"],
  SENT: ["markOverdue", "markPaid", "void"],
  OVERDUE: ["markPaid", "void"],
  PAID: [],
  VOID: [],
};

export const getAllowedInvoiceStatusActions = (status: InvoiceStatus) => allowedStatusActions[status];

export const isInvoiceEffectivelyOverdue = (invoice: {
  status: InvoiceStatus;
  dueDate: Date;
}) => {
  if (invoice.status !== "SENT") {
    return false;
  }

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDate = new Date(
    invoice.dueDate.getFullYear(),
    invoice.dueDate.getMonth(),
    invoice.dueDate.getDate(),
  );

  return dueDate < todayDate;
};

export const getInvoices = (organizationId: string) =>
  prisma.invoice.findMany({
    where: { organizationId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

export const getInvoiceFormOptions = (organizationId: string) =>
  prisma.customer.findMany({
    where: {
      organizationId,
      archivedAt: null,
    },
    orderBy: { name: "asc" },
  });

export const getInvoiceDetails = (organizationId: string, invoiceId: string) =>
  prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
    },
    include: {
      customer: true,
      lines: {
        orderBy: { createdAt: "asc" },
      },
      payments: {
        orderBy: { paidAt: "desc" },
      },
    },
  });

export const createInvoiceRecord = async (organizationId: string, data: InvoiceForm) => {
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

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: {
        id: data.customerId,
        organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!customer) {
      return null;
    }

    const number = await nextInvoiceNumber(tx, organizationId);

    return tx.invoice.create({
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
  });
};

export const updateInvoiceStatus = async (
  organizationId: string,
  invoiceId: string,
  data: InvoiceStatusActionForm,
) => {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
    },
    select: {
      id: true,
      status: true,
      totalCents: true,
    },
  });

  if (!invoice) {
    return { ok: false as const, reason: "notFound" as const };
  }

  if (!getAllowedInvoiceStatusActions(invoice.status).includes(data.action)) {
    return { ok: false as const, reason: "invalidTransition" as const };
  }

  if (data.action === "markPaid") {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: invoice.totalCents,
          paidAt: data.paidAt!,
          reference: data.reference || null,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID" },
      });
    });

    return { ok: true as const, status: "PAID" as const };
  }

  const status = statusActionTargets[data.action];

  if (!status) {
    return { ok: false as const, reason: "invalidTransition" as const };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status },
  });

  return { ok: true as const, status };
};
