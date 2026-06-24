import type { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { getOrganizationCountryLabel } from '../../lib/countries';
import { calculateInvoiceTotals } from '../../lib/money';
import { rateToNumber, resolveInvoiceWithholding } from '../../lib/withholding';
import { buildVerifactuRecordData } from '../verifactu/verifactu-record';
import { buildVerifactuXml } from '../verifactu/verifactu-xml';
import {
  buildVerifactuPayloadForFiscalRecord,
  buildVerifactuSoftware,
  verifactuOrganizationSoftwareSelect,
} from '../verifactu/verifactu-payload';
import {
  createInvoiceFiscalRecord,
  verifyInvoiceFiscalRecordChain,
} from './invoice-fiscal-records';
import { nextInvoiceNumber } from './invoice-numbering';
import type {
  InvoiceForm,
  InvoiceListQuery,
  InvoiceListSort,
  InvoiceMetadataForm,
  InvoicePaymentForm,
  InvoiceStatusActionForm,
} from './invoice.schema';

export type InvoiceStatusAction = InvoiceStatusActionForm['action'];

const statusActionTargets: Partial<Record<InvoiceStatusAction, InvoiceStatus>> =
  {
    issue: 'ISSUED',
    void: 'VOID',
  };

const allowedStatusActions: Record<InvoiceStatus, InvoiceStatusAction[]> = {
  DRAFT: ['issue', 'void'],
  ISSUED: ['void'],
  VOID: [],
};

export const getAllowedInvoiceStatusActions = (status: InvoiceStatus) =>
  allowedStatusActions[status];

export const canRecordInvoicePayment = (status: InvoiceStatus) =>
  status === 'ISSUED';

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

export const calculateInvoicePaymentStatus = (invoice: {
  totalCents: number;
  paidCents: number;
}): PaymentStatus => {
  if (invoice.paidCents === 0) {
    return 'UNPAID';
  }

  if (invoice.paidCents >= invoice.totalCents && invoice.totalCents > 0) {
    return 'PAID';
  }

  return 'PARTIALLY_PAID';
};

const isPastDueDate = (dueDate: Date, now = new Date()) => {
  const todayDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const dueDateOnly = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );

  return dueDateOnly < todayDate;
};

export const isInvoiceOverdue = (invoice: {
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  dueDate: Date;
}, now = new Date()) => {
  if (invoice.status !== 'ISSUED' || invoice.paymentStatus === 'PAID') {
    return false;
  }

  return isPastDueDate(invoice.dueDate, now);
};

export const isInvoiceEffectivelyOverdue = isInvoiceOverdue;

export const canEditInvoice = (status: InvoiceStatus) => {
  return status === 'DRAFT';
};

type OrganizationInvoiceSettings = {
  countryCode: string | null;
  legalForm: string;
  withholdingEnabled: boolean;
  defaultWithholdingType: string | null;
  defaultWithholdingRate: Prisma.Decimal | null;
};

type CreateInvoiceRecordOptions = {
  replacesInvoiceId?: string;
};

const calculateTotalsFromInvoiceForm = (
  data: InvoiceForm,
  organization?: OrganizationInvoiceSettings | null,
) => {
  const withholding = organization
    ? resolveInvoiceWithholding(organization, data)
    : { withholdingType: null, withholdingRate: null };

  return calculateInvoiceTotals(
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
    withholding.withholdingType === 'IRPF' && withholding.withholdingRate
      ? { type: 'IRPF', rate: withholding.withholdingRate }
      : null,
  );
};

const invoiceWithholdingData = (
  data: InvoiceForm,
  organization: OrganizationInvoiceSettings,
  totals: ReturnType<typeof calculateTotalsFromInvoiceForm>,
) => {
  const withholding = resolveInvoiceWithholding(organization, data);

  if (withholding.withholdingType !== 'IRPF' || !withholding.withholdingRate) {
    return {
      withholdingType: null,
      withholdingRate: null,
      withholdingAmountCents: null,
    };
  }

  return {
    withholdingType: 'IRPF',
    withholdingRate: withholding.withholdingRate,
    withholdingAmountCents: totals.withholdingAmountCents,
  };
};

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
    select: {
      billingEmail: true,
      countryCode: true,
      ...verifactuOrganizationSoftwareSelect,
      legalForm: true,
      withholdingEnabled: true,
      defaultWithholdingType: true,
      defaultWithholdingRate: true,
    },
  });

const findOrganizationInvoiceSettings = (
  tx: Prisma.TransactionClient,
  organizationId: string,
) =>
  tx.organization.findFirst({
    where: { id: organizationId },
    select: {
      countryCode: true,
      legalForm: true,
      withholdingEnabled: true,
      defaultWithholdingType: true,
      defaultWithholdingRate: true,
    },
  });

const createVerifactuRecordForFiscalRecord = async (
  tx: Prisma.TransactionClient,
  fiscalRecordId: string,
) => {
  const existingRecord = await tx.verifactuRecord.findUnique({
    where: { invoiceFiscalRecordId: fiscalRecordId },
    select: { id: true },
  });

  if (existingRecord) {
    return existingRecord;
  }

  const { payload, previousVerifactuRecordId } =
    await buildVerifactuPayloadForFiscalRecord(tx, fiscalRecordId);

  return tx.verifactuRecord.create({
    data: buildVerifactuRecordData({
      payload,
      previousVerifactuRecordId,
      xml: buildVerifactuXml(payload),
    }),
  });
};

const maybeCreateVerifactuRecordForFiscalRecord = (
  tx: Prisma.TransactionClient,
  organizationCountryCode: string | null | undefined,
  fiscalRecordId: string,
) => {
  if (organizationCountryCode !== 'ES') {
    return null;
  }

  return createVerifactuRecordForFiscalRecord(tx, fiscalRecordId);
};

const validateInvoiceReplacement = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
  replacesInvoiceId?: string,
) => {
  if (!replacesInvoiceId) {
    return { ok: true as const, data: {} };
  }

  const originalInvoice = await tx.invoice.findFirst({
    where: {
      id: replacesInvoiceId,
      organizationId,
    },
    select: {
      id: true,
      status: true,
      replacementInvoice: {
        select: { id: true },
      },
    },
  });

  if (
    !originalInvoice ||
    originalInvoice.status !== 'VOID' ||
    originalInvoice.replacementInvoice
  ) {
    return {
      ok: false as const,
      reason: 'invalidReplacementInvoice' as const,
    };
  }

  return {
    ok: true as const,
    data: { replacesInvoiceId: originalInvoice.id },
  };
};

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

const invoiceListOrderBy: Record<
  InvoiceListSort,
  (
    direction: InvoiceListQuery['direction'],
  ) => Prisma.InvoiceOrderByWithRelationInput
> = {
  number: (direction) => ({ number: direction }),
  issueDate: (direction) => ({ issueDate: direction }),
  dueDate: (direction) => ({ dueDate: direction }),
  status: (direction) => ({ status: direction }),
  totalCents: (direction) => ({ totalCents: direction }),
  createdAt: (direction) => ({ createdAt: direction }),
};

const createInvoiceListWhere = (
  organizationId: string,
  query: InvoiceListQuery,
  now: Date,
): Prisma.InvoiceWhereInput => {
  const where: Prisma.InvoiceWhereInput = { organizationId };

  if (query.status) {
    where.status = query.status;
  }

  if (query.paymentStatus) {
    where.paymentStatus = query.paymentStatus;
  }

  if (query.overdue) {
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        status: 'ISSUED',
        paymentStatus: { not: 'PAID' },
        dueDate: { lt: startOfToday },
      },
    ];
  }

  if (query.q) {
    where.OR = [
      { number: { contains: query.q, mode: 'insensitive' } },
      {
        customer: {
          name: { contains: query.q, mode: 'insensitive' },
        },
      },
      {
        snapshot: {
          is: {
            customerName: { contains: query.q, mode: 'insensitive' },
          },
        },
      },
    ];
  }

  return where;
};

export const getInvoices = async (
  organizationId: string,
  query: InvoiceListQuery,
  now = new Date(),
) => {
  const where = createInvoiceListWhere(organizationId, query, now);

  const skip = (query.page - 1) * query.limit;
  const orderBy = invoiceListOrderBy[query.sort](query.direction);
  const [totalCount, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: { customer: true, snapshot: true, payments: true },
      orderBy,
      skip,
      take: query.limit,
    }),
  ]);
  const totalPages = Math.max(Math.ceil(totalCount / query.limit), 1);

  return {
    invoices,
    totalCount,
    query,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalPages,
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < totalPages,
      previousPage: query.page > 1 ? query.page - 1 : null,
      nextPage: query.page < totalPages ? query.page + 1 : null,
    },
  };
};

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

export const verifyOrganizationFiscalRecordChain = (organizationId: string) =>
  verifyInvoiceFiscalRecordChain(prisma, organizationId);

export const createInvoiceRecord = async (
  organizationId: string,
  data: InvoiceForm,
  options: CreateInvoiceRecordOptions = {},
) => {
  return prisma.$transaction(async (tx) => {
    const customer = await findActiveCustomer(
      tx,
      organizationId,
      data.customerId,
    );

    if (!customer) {
      return { ok: false as const, reason: 'invalidCustomer' as const };
    }

    const replacement = await validateInvoiceReplacement(
      tx,
      organizationId,
      options.replacesInvoiceId,
    );

    if (!replacement.ok) {
      return replacement;
    }

    const organization = await findOrganizationInvoiceSettings(
      tx,
      organizationId,
    );
    const totals = calculateTotalsFromInvoiceForm(data, organization);
    const withholding = organization
      ? invoiceWithholdingData(data, organization, totals)
      : {
          withholdingType: null,
          withholdingRate: null,
          withholdingAmountCents: null,
        };
    const number = await nextInvoiceNumber(tx, organizationId);

    const invoice = await tx.invoice.create({
      data: {
        organizationId,
        number,
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        customerId: data.customerId,
        ...replacement.data,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        ...withholding,
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

export const createIssuedInvoiceRecord = async (
  organizationId: string,
  createdByUserId: string | null,
  data: InvoiceForm,
  options: CreateInvoiceRecordOptions = {},
) => {
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

    const organization = await findOrganizationEmailSettings(
      tx,
      organizationId,
    );

    if (!organization?.billingEmail?.trim()) {
      return { ok: false as const, reason: 'missingBillingEmail' as const };
    }

    if (organization.countryCode === 'ES') {
      buildVerifactuSoftware(organization);
    }

    const replacement = await validateInvoiceReplacement(
      tx,
      organizationId,
      options.replacesInvoiceId,
    );

    if (!replacement.ok) {
      return replacement;
    }

    const totals = calculateTotalsFromInvoiceForm(data, organization);
    const withholding = invoiceWithholdingData(data, organization, totals);
    const number = await nextInvoiceNumber(tx, organizationId);

    const invoice = await tx.invoice.create({
      data: {
        organizationId,
        number,
        status: 'ISSUED',
        paymentStatus: 'UNPAID',
        customerId: data.customerId,
        ...replacement.data,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        ...withholding,
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
            countryCode: true,
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
    const fiscalRecord = await createInvoiceFiscalRecord(tx, {
      invoiceId: invoice.id,
      organizationId,
      type: 'ALTA',
      createdByUserId,
    });
    await maybeCreateVerifactuRecordForFiscalRecord(
      tx,
      organization.countryCode,
      fiscalRecord.id,
    );

    return { ok: true as const, invoice, customerEmail };
  });
};

export const updateDraftInvoiceRecord = async (
  organizationId: string,
  invoiceId: string,
  data: InvoiceForm,
) => {
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
    const customer = await findActiveCustomer(
      tx,
      organizationId,
      data.customerId,
    );

    if (!customer) {
      return { ok: false as const, reason: 'invalidCustomer' as const };
    }

    const organization = await findOrganizationInvoiceSettings(
      tx,
      organizationId,
    );
    const totals = calculateTotalsFromInvoiceForm(data, organization);
    const withholding = organization
      ? invoiceWithholdingData(data, organization, totals)
      : {
          withholdingType: null,
          withholdingRate: null,
          withholdingAmountCents: null,
        };
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        customerId: data.customerId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        ...withholding,
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
  withholdingType: string | null;
  withholdingRate: Prisma.Decimal | number | null;
  withholdingAmountCents: number | null;
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
    countryCode: string | null;
  };
  snapshot: { invoiceId: string } | null;
};

const captureInvoiceSnapshot = (
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
      sellerCountry: getOrganizationCountryLabel(invoice.organization.countryCode),
      paymentInstructions: invoice.paymentInstructions,
      subtotalCents: invoice.subtotalCents,
      discountCents: invoice.discountCents,
      taxCents: invoice.taxCents,
      withholdingType: invoice.withholdingType ?? null,
      withholdingRate: rateToNumber(invoice.withholdingRate),
      withholdingAmountCents: invoice.withholdingAmountCents ?? null,
      totalCents: invoice.totalCents,
    },
  });
};

type LockedInvoiceStatusRow = {
  id: string;
  status: InvoiceStatus;
};

export const updateInvoiceStatus = async (
  organizationId: string,
  invoiceId: string,
  createdByUserId: string | null,
  data: InvoiceStatusActionForm,
) => {
  return prisma.$transaction(async (tx) => {
    const lockedInvoices = await tx.$queryRaw<LockedInvoiceStatusRow[]>`
      SELECT "id", "status"
      FROM "Invoice"
      WHERE "id" = ${invoiceId}::uuid
        AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const lockedInvoice = lockedInvoices[0];

    if (!lockedInvoice) {
      return { ok: false as const, reason: 'notFound' as const };
    }

    if (!getAllowedInvoiceStatusActions(lockedInvoice.status).includes(data.action)) {
      return { ok: false as const, reason: 'invalidTransition' as const };
    }

    const status = statusActionTargets[data.action];

    if (!status) {
      return { ok: false as const, reason: 'invalidTransition' as const };
    }

    let issueOrganizationCountryCode: string | null | undefined;

    if (lockedInvoice.status === 'DRAFT' && status === 'ISSUED') {
      const invoice = await tx.invoice.findFirst({
        where: {
          id: lockedInvoice.id,
          organizationId,
        },
        select: {
          id: true,
          status: true,
          subtotalCents: true,
          discountCents: true,
          taxCents: true,
          withholdingType: true,
          withholdingRate: true,
          withholdingAmountCents: true,
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
              countryCode: true,
              ...verifactuOrganizationSoftwareSelect,
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

      if (invoice.organization.countryCode === 'ES') {
        buildVerifactuSoftware(invoice.organization);
      }
      issueOrganizationCountryCode = invoice.organization.countryCode;

      await captureInvoiceSnapshot(tx, invoice);
    }

    await tx.invoice.update({
      where: { id: lockedInvoice.id },
      data: { status },
    });

    if (lockedInvoice.status === 'DRAFT' && status === 'ISSUED') {
      const fiscalRecord = await createInvoiceFiscalRecord(tx, {
        invoiceId: lockedInvoice.id,
        organizationId,
        type: 'ALTA',
        createdByUserId,
      });
      await maybeCreateVerifactuRecordForFiscalRecord(
        tx,
        issueOrganizationCountryCode,
        fiscalRecord.id,
      );
    }

    if (lockedInvoice.status === 'ISSUED' && status === 'VOID') {
      await createInvoiceFiscalRecord(tx, {
        invoiceId: lockedInvoice.id,
        organizationId,
        type: 'ANULACION',
        createdByUserId,
      });
    }

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
};

const updateInvoicePaymentStatusFromPayments = async (
  tx: Prisma.TransactionClient,
  invoice: Pick<LockedInvoiceRow, 'id' | 'totalCents'>,
) => {
  const payments = await tx.payment.aggregate({
    where: { invoiceId: invoice.id },
    _sum: { amountCents: true },
  });
  const paidCents = payments._sum.amountCents ?? 0;
  const outstandingCents = Math.max(invoice.totalCents - paidCents, 0);
  const paymentStatus = calculateInvoicePaymentStatus({
    totalCents: invoice.totalCents,
    paidCents,
  });

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { paymentStatus },
  });

  return {
    paidCents,
    outstandingCents,
    paymentStatus,
  };
};

export const recalculateInvoicePaymentStatus = (
  organizationId: string,
  invoiceId: string,
) =>
  prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invoices = await tx.$queryRaw<LockedInvoiceRow[]>`
      SELECT "id", "status", "totalCents"
      FROM "Invoice"
      WHERE "id" = ${invoiceId}::uuid
        AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE
    `;
    const invoice = invoices[0];

    if (!invoice) {
      return { ok: false as const, reason: 'notFound' as const };
    }

    const summary = await updateInvoicePaymentStatusFromPayments(tx, invoice);

    return { ok: true as const, ...summary };
  });

export const recordInvoicePayment = (
  organizationId: string,
  invoiceId: string,
  data: InvoicePaymentForm,
) =>
  prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invoices = await tx.$queryRaw<LockedInvoiceRow[]>`
      SELECT "id", "status", "totalCents"
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

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: data.amountCents,
        paidAt: data.paidAt,
        reference: data.reference || null,
      },
    });

    const summary = await updateInvoicePaymentStatusFromPayments(tx, invoice);

    return {
      ok: true as const,
      payment,
      paymentStatus: summary.paymentStatus,
      outstandingCents: summary.outstandingCents,
    };
  });
