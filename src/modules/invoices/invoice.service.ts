import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { calculateInvoiceTotals } from "../../lib/money";
import type { InvoiceForm, InvoicePaymentForm, InvoiceStatusActionForm } from "./invoice.schema";
import { nextInvoiceNumber } from "./invoice-numbering";

export type InvoiceStatusAction = InvoiceStatusActionForm["action"];

const statusActionTargets: Partial<Record<InvoiceStatusAction, InvoiceStatus>> = {
  send: "SENT",
  markOverdue: "OVERDUE",
  void: "VOID",
};

const allowedStatusActions: Record<InvoiceStatus, InvoiceStatusAction[]> = {
  DRAFT: ["send", "void"],
  SENT: ["markOverdue", "void"],
  PARTIALLY_PAID: ["markOverdue", "void"],
  OVERDUE: ["void"],
  PAID: [],
  VOID: [],
};

export const getAllowedInvoiceStatusActions = (status: InvoiceStatus) => allowedStatusActions[status];

export const paymentEligibleStatuses: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export const canRecordInvoicePayment = (status: InvoiceStatus) =>
  paymentEligibleStatuses.includes(status);

export const calculateInvoicePaymentSummary = (invoice: {
  totalCents: number;
  payments: Array<{ amountCents: number }>;
}) => {
  const paidCents = invoice.payments.reduce((total, payment) => total + payment.amountCents, 0);
  const outstandingCents = Math.max(invoice.totalCents - paidCents, 0);

  return {
    paidCents,
    outstandingCents,
    isPaid: outstandingCents === 0,
  };
};

const isPastDueDate = (dueDate: Date) => {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  return dueDateOnly < todayDate;
};

export const isInvoiceEffectivelyOverdue = (invoice: {
  status: InvoiceStatus;
  dueDate: Date;
}) => {
  if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") {
    return false;
  }

  return isPastDueDate(invoice.dueDate);
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

type LockedInvoiceRow = {
  id: string;
  status: InvoiceStatus;
  totalCents: number;
  dueDate: Date;
};

export const recordInvoicePayment = (
  organizationId: string,
  invoiceId: string,
  data: InvoicePaymentForm,
) =>
  prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invoices = await tx.$queryRaw<LockedInvoiceRow[]>`
      SELECT "id", "status", "totalCents", "dueDate"
      FROM "Invoice"
      WHERE "id" = ${invoiceId}::uuid
        AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const invoice = invoices[0];

    if (!invoice) {
      return { ok: false as const, reason: "notFound" as const };
    }

    if (!canRecordInvoicePayment(invoice.status)) {
      return { ok: false as const, reason: "invalidStatus" as const };
    }

    const payments = await tx.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amountCents: true },
    });
    const paidCents = payments._sum.amountCents ?? 0;
    const outstandingCents = Math.max(invoice.totalCents - paidCents, 0);

    if (outstandingCents <= 0) {
      return { ok: false as const, reason: "alreadyPaid" as const };
    }

    if (data.amountCents > outstandingCents) {
      return {
        ok: false as const,
        reason: "overpayment" as const,
        outstandingCents,
      };
    }

    const nextOutstandingCents = outstandingCents - data.amountCents;
    const status: InvoiceStatus =
      nextOutstandingCents === 0
        ? "PAID"
        : invoice.status === "OVERDUE" || isPastDueDate(invoice.dueDate)
          ? "OVERDUE"
          : "PARTIALLY_PAID";

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: data.amountCents,
        paidAt: data.paidAt,
        reference: data.reference || null,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status },
    });

    return { ok: true as const, payment, status, outstandingCents: nextOutstandingCents };
  });
