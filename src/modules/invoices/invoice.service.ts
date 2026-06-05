import type { InvoiceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { calculateInvoiceTotals } from '../../lib/money';
import { nextInvoiceNumber } from './invoice-numbering';
import type {
  InvoiceForm,
  InvoiceMetadataForm,
  InvoicePaymentForm,
  InvoiceStatusActionForm,
} from './invoice.schema';

export type InvoiceStatusAction = InvoiceStatusActionForm['action'];

const statusActionTargets: Partial<Record<InvoiceStatusAction, InvoiceStatus>> =
  {
    send: 'SENT',
    markOverdue: 'OVERDUE',
    void: 'VOID',
  };

const allowedStatusActions: Record<InvoiceStatus, InvoiceStatusAction[]> = {
  DRAFT: ['send', 'void'],
  SENT: ['markOverdue', 'void'],
  PARTIALLY_PAID: ['markOverdue', 'void'],
  OVERDUE: ['void'],
  PAID: [],
  VOID: [],
};

export const getAllowedInvoiceStatusActions = (status: InvoiceStatus) =>
  allowedStatusActions[status];

export const paymentEligibleStatuses: InvoiceStatus[] = [
  'SENT',
  'PARTIALLY_PAID',
  'OVERDUE',
];

export const canRecordInvoicePayment = (status: InvoiceStatus) =>
  paymentEligibleStatuses.includes(status);

export const calculateInvoicePaymentSummary = (invoice: {
  totalCents: number;
  payments: Array<{ amountCents: number }>;
}) => {
  const paidCents = invoice.payments.reduce(
    (total, payment) => total + payment.amountCents,
    0,
  );
  const outstandingCents = Math.max(invoice.totalCents - paidCents, 0);

  return {
    paidCents,
    outstandingCents,
    isPaid: outstandingCents === 0,
  };
};

const isPastDueDate = (dueDate: Date) => {
  const today = new Date();
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dueDateOnly = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );

  return dueDateOnly < todayDate;
};

export const isInvoiceEffectivelyOverdue = (invoice: {
  status: InvoiceStatus;
  dueDate: Date;
}) => {
  if (invoice.status !== 'SENT' && invoice.status !== 'PARTIALLY_PAID') {
    return false;
  }

  return isPastDueDate(invoice.dueDate);
};

export const canEditInvoice = (status: InvoiceStatus) => {
  return status === 'DRAFT';
};

const calculateTotalsFromInvoiceForm = (data: InvoiceForm) =>
  calculateInvoiceTotals(
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

const invoiceLineCreateData = (
  data: InvoiceForm,
  totals: ReturnType<typeof calculateTotalsFromInvoiceForm>,
) =>
  data.lines.map((line, index) => {
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
  });

const findActiveCustomer = (
  tx: Prisma.TransactionClient,
  organizationId: string,
  customerId: string,
) =>
  tx.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });

const findActiveCustomerForSending = (
  tx: Prisma.TransactionClient,
  organizationId: string,
  customerId: string,
) =>
  tx.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
      archivedAt: null,
    },
    select: { id: true, email: true },
  });

const findOrganizationEmailSettings = (
  tx: Prisma.TransactionClient,
  organizationId: string,
) =>
  tx.organization.findFirst({
    where: { id: organizationId },
    select: { billingEmail: true },
  });

const findEditableDraftInvoice = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  invoiceId: string,
) => {
  const invoice = await tx.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!invoice) {
    return { ok: false as const, reason: 'notFound' as const };
  }

  if (!canEditInvoice(invoice.status)) {
    return { ok: false as const, reason: 'notEditable' as const };
  }

  return { ok: true as const, invoice };
};

const replaceInvoiceLines = async (
  tx: Prisma.TransactionClient,
  invoiceId: string,
  data: InvoiceForm,
  totals: ReturnType<typeof calculateTotalsFromInvoiceForm>,
) => {
  await tx.invoiceLine.deleteMany({
    where: { invoiceId },
  });

  return {
    create: invoiceLineCreateData(data, totals),
  };
};

export const getInvoices = (organizationId: string) =>
  prisma.invoice.findMany({
    where: { organizationId },
    include: { customer: true, snapshot: true },
    orderBy: { createdAt: 'desc' },
  });

export const getInvoiceFormOptions = (organizationId: string) =>
  prisma.customer.findMany({
    where: {
      organizationId,
      archivedAt: null,
    },
    orderBy: { name: 'asc' },
  });

export const getInvoiceDetails = (organizationId: string, invoiceId: string) =>
  prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
    },
    include: {
      customer: true,
      snapshot: true,
      lines: {
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        orderBy: { paidAt: 'desc' },
      },
      emailDeliveries: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

export const createInvoiceRecord = async (
  organizationId: string,
  data: InvoiceForm,
) => {
  const totals = calculateTotalsFromInvoiceForm(data);

  return prisma.$transaction(async (tx) => {
    const customer = await findActiveCustomer(tx, organizationId, data.customerId);

    if (!customer) {
      return { ok: false as const, reason: 'invalidCustomer' as const };
    }

    const number = await nextInvoiceNumber(tx, organizationId);

    const invoice = await tx.invoice.create({
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
        currency: data.currency,
        paymentInstructions: data.paymentInstructions || null,
        notes: data.notes || null,
        lines: {
          create: invoiceLineCreateData(data, totals),
        },
      },
    });

    return { ok: true as const, invoice };
  });
};

export const createSentInvoiceRecord = async (
  organizationId: string,
  data: InvoiceForm,
) => {
  const totals = calculateTotalsFromInvoiceForm(data);

  return prisma.$transaction(async (tx) => {
    const customer = await findActiveCustomerForSending(
      tx,
      organizationId,
      data.customerId,
    );

    if (!customer) {
      return { ok: false as const, reason: 'invalidCustomer' as const };
    }

    const customerEmail = customer.email?.trim();

    if (!customerEmail) {
      return { ok: false as const, reason: 'missingCustomerEmail' as const };
    }

    const organization = await findOrganizationEmailSettings(tx, organizationId);

    if (!organization?.billingEmail?.trim()) {
      return { ok: false as const, reason: 'missingBillingEmail' as const };
    }

    const number = await nextInvoiceNumber(tx, organizationId);

    const invoice = await tx.invoice.create({
      data: {
        organizationId,
        number,
        status: 'SENT',
        customerId: data.customerId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        currency: data.currency,
        paymentInstructions: data.paymentInstructions || null,
        notes: data.notes || null,
        lines: {
          create: invoiceLineCreateData(data, totals),
        },
      },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            taxId: true,
            addressLine1: true,
            city: true,
            country: true,
          },
        },
        organization: {
          select: {
            name: true,
            legalName: true,
            taxId: true,
            addressLine1: true,
            city: true,
            country: true,
          },
        },
        snapshot: {
          select: {
            invoiceId: true,
          },
        },
      },
    });

    await captureInvoiceSnapshot(tx, invoice);

    return { ok: true as const, invoice, customerEmail };
  });
};

export const updateDraftInvoiceRecord = async (
  organizationId: string,
  invoiceId: string,
  data: InvoiceForm,
) => {
  const totals = calculateTotalsFromInvoiceForm(data);

  return prisma.$transaction(async (tx) => {
    const editableInvoice = await findEditableDraftInvoice(
      tx,
      organizationId,
      invoiceId,
    );

    if (!editableInvoice.ok) {
      return editableInvoice;
    }

    const { invoice } = editableInvoice;
    const customer = await findActiveCustomer(tx, organizationId, data.customerId);

    if (!customer) {
      return { ok: false as const, reason: 'invalidCustomer' as const };
    }

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        customerId: data.customerId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        currency: data.currency,
        paymentInstructions: data.paymentInstructions || null,
        notes: data.notes || null,
        lines: await replaceInvoiceLines(tx, invoice.id, data, totals),
      },
    });

    return { ok: true as const, invoice: updatedInvoice };
  });
};

type InvoiceSnapshotSource = {
  id: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentInstructions: string | null;
  customer: {
    name: string;
    email: string | null;
    taxId: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
  };
  organization: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
  };
  snapshot: { invoiceId: string } | null;
};

export const captureInvoiceSnapshot = (
  tx: Prisma.TransactionClient,
  invoice: InvoiceSnapshotSource,
) => {
  if (invoice.snapshot) {
    return null;
  }

  return tx.invoiceSnapshot.create({
    data: {
      invoiceId: invoice.id,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      customerTaxId: invoice.customer.taxId,
      customerAddressLine1: invoice.customer.addressLine1,
      customerCity: invoice.customer.city,
      customerCountry: invoice.customer.country,
      sellerName: invoice.organization.name,
      sellerLegalName: invoice.organization.legalName,
      sellerTaxId: invoice.organization.taxId,
      sellerAddressLine1: invoice.organization.addressLine1,
      sellerCity: invoice.organization.city,
      sellerCountry: invoice.organization.country,
      paymentInstructions: invoice.paymentInstructions,
      subtotalCents: invoice.subtotalCents,
      discountCents: invoice.discountCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
    },
  });
};

export const updateInvoiceStatus = async (
  organizationId: string,
  invoiceId: string,
  data: InvoiceStatusActionForm,
) => {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        organizationId,
      },
      select: {
        id: true,
        status: true,
        subtotalCents: true,
        discountCents: true,
        taxCents: true,
        totalCents: true,
        paymentInstructions: true,
        customer: {
          select: {
            name: true,
            email: true,
            taxId: true,
            addressLine1: true,
            city: true,
            country: true,
          },
        },
        organization: {
          select: {
            name: true,
            legalName: true,
            taxId: true,
            addressLine1: true,
            city: true,
            country: true,
          },
        },
        snapshot: {
          select: {
            invoiceId: true,
          },
        },
      },
    });

    if (!invoice) {
      return { ok: false as const, reason: 'notFound' as const };
    }

    if (!getAllowedInvoiceStatusActions(invoice.status).includes(data.action)) {
      return { ok: false as const, reason: 'invalidTransition' as const };
    }

    const status = statusActionTargets[data.action];

    if (!status) {
      return { ok: false as const, reason: 'invalidTransition' as const };
    }

    if (invoice.status === 'DRAFT' && status === 'SENT') {
      await captureInvoiceSnapshot(tx, invoice);
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status },
    });

    return { ok: true as const, status };
  });
};

export const updateInvoiceMetadata = async (
  organizationId: string,
  invoiceId: string,
  data: InvoiceMetadataForm,
) =>
  prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        organizationId,
      },
      select: {
        id: true,
        status: true,
        snapshot: {
          select: {
            invoiceId: true,
          },
        },
      },
    });

    if (!invoice) {
      return { ok: false as const, reason: 'notFound' as const };
    }

    if (data.intent === 'notes') {
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { notes: data.notes || null },
      });

      return { ok: true as const, invoice: updatedInvoice };
    }

    const paymentInstructions = data.paymentInstructions || null;

    if (invoice.status === 'DRAFT') {
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { paymentInstructions },
      });

      return { ok: true as const, invoice: updatedInvoice };
    }

    if (!invoice.snapshot && paymentInstructions) {
      return { ok: false as const, reason: 'missingSnapshot' as const };
    }

    if (!invoice.snapshot) {
      return { ok: false as const, reason: 'missingSnapshot' as const };
    }

    await tx.invoiceSnapshot.update({
      where: { invoiceId: invoice.id },
      data: { paymentInstructions },
    });

    return { ok: true as const };
  });

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
      return { ok: false as const, reason: 'notFound' as const };
    }

    if (!canRecordInvoicePayment(invoice.status)) {
      return { ok: false as const, reason: 'invalidStatus' as const };
    }

    const payments = await tx.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amountCents: true },
    });
    const paidCents = payments._sum.amountCents ?? 0;
    const outstandingCents = Math.max(invoice.totalCents - paidCents, 0);

    if (outstandingCents <= 0) {
      return { ok: false as const, reason: 'alreadyPaid' as const };
    }

    if (data.amountCents > outstandingCents) {
      return {
        ok: false as const,
        reason: 'overpayment' as const,
        outstandingCents,
      };
    }

    const nextOutstandingCents = outstandingCents - data.amountCents;
    const status: InvoiceStatus =
      nextOutstandingCents === 0
        ? 'PAID'
        : invoice.status === 'OVERDUE' || isPastDueDate(invoice.dueDate)
          ? 'OVERDUE'
          : 'PARTIALLY_PAID';

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

    return {
      ok: true as const,
      payment,
      status,
      outstandingCents: nextOutstandingCents,
    };
  });
