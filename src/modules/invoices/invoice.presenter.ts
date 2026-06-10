import type { InvoiceEmailDeliveryStatus, InvoiceStatus } from '@prisma/client';
import type { Translate } from '../../lib/i18n';
import { formatRateLabel } from '../../lib/withholding';
import {
  createInvoiceMetadataValues,
  createInvoicePaymentValues,
  invoiceListLimits,
  invoiceListSortableColumns,
  invoiceListStatusOptions,
  type InvoiceMetadataErrors,
  type InvoiceMetadataIntent,
  type InvoiceMetadataValues,
  type InvoiceFormValues,
  type InvoiceListDirection,
  type InvoiceListQuery,
  type InvoiceListSort,
  type InvoicePaymentErrors,
  type InvoicePaymentValues,
} from './invoice.schema';
import type {
  InvoiceEmailErrors,
  InvoiceEmailValues,
} from './invoice-email.schema';
import {
  calculateInvoicePaymentSummary,
  canEditInvoice,
  canRecordInvoicePayment,
  getAllowedInvoiceStatusActions,
  type getInvoiceDetails,
  type getInvoices,
  isInvoiceEffectivelyOverdue,
} from './invoice.service';

type InvoiceDetails = NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>;
type InvoiceList = Awaited<ReturnType<typeof getInvoices>>;
type InvoiceListItem = InvoiceList['invoices'][number];

type BadgeVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

type InvoiceDisplaySource = InvoiceDetails & {
  organization?: {
    locale: string;
  };
};

type InvoiceLineDisplayInput = {
  totalCents: number;
  taxCents: number;
  taxRateBps: number;
};

const centsToAmountInput = (amountCents: number) =>
  (amountCents / 100).toFixed(2);

const dateToInputValue = (date: Date) => date.toISOString().slice(0, 10);

const formatTaxRateLabel = (taxRateBps: number) =>
  `${(taxRateBps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;

const invoiceWithholdingRateFormValues = (
  withholdingRate: InvoiceDetails['withholdingRate'],
) => {
  const rate = formatRateLabel(withholdingRate);

  if (!rate) {
    return {
      withholdingRateType: '15',
      withholdingRate: '15',
    } satisfies Pick<InvoiceFormValues, 'withholdingRateType' | 'withholdingRate'>;
  }

  return {
    withholdingRateType: rate === '15' || rate === '7' ? rate : 'custom',
    withholdingRate: rate,
  } satisfies Pick<InvoiceFormValues, 'withholdingRateType' | 'withholdingRate'>;
};

const invoiceStatusBadges: Record<
  InvoiceStatus,
  { label: string; labelKey: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Draft', labelKey: 'invoices.statuses.draft', variant: 'neutral' },
  SENT: { label: 'Sent', labelKey: 'invoices.statuses.sent', variant: 'info' },
  PARTIALLY_PAID: { label: 'Partially paid', labelKey: 'invoices.statuses.partially_paid', variant: 'warning' },
  PAID: { label: 'Paid', labelKey: 'invoices.statuses.paid', variant: 'success' },
  OVERDUE: { label: 'Overdue', labelKey: 'invoices.statuses.overdue', variant: 'danger' },
  VOID: { label: 'Void', labelKey: 'invoices.statuses.void', variant: 'muted' },
};

const emailDeliveryStatusBadges: Record<
  InvoiceEmailDeliveryStatus,
  { label: string; labelKey: string; variant: BadgeVariant }
> = {
  PENDING: { label: 'Pending', labelKey: 'invoices.emailStatuses.pending', variant: 'warning' },
  SENT: { label: 'Sent', labelKey: 'invoices.emailStatuses.sent', variant: 'info' },
  DELIVERED: { label: 'Delivered', labelKey: 'invoices.emailStatuses.delivered', variant: 'success' },
  FAILED: { label: 'Failed', labelKey: 'invoices.emailStatuses.failed', variant: 'danger' },
  BOUNCED: { label: 'Bounced', labelKey: 'invoices.emailStatuses.bounced', variant: 'danger' },
  SPAM_COMPLAINT: { label: 'Spam complaint', labelKey: 'invoices.emailStatuses.spamComplaint', variant: 'danger' },
};

export const createInvoiceStatusBadge = (status: InvoiceStatus) =>
  invoiceStatusBadges[status];

export const createInvoiceStatusBadges = (invoice: {
  status: InvoiceStatus;
  dueDate: Date;
  totalCents: number;
  payments?: Array<{ amountCents: number }>;
}) => {
  if (invoice.status === 'DRAFT' || invoice.status === 'PAID' || invoice.status === 'VOID') {
    return [createInvoiceStatusBadge(invoice.status)];
  }

  const payments = invoice.payments;
  const paymentSummary = payments
    ? calculateInvoicePaymentSummary({ ...invoice, payments })
    : null;
  const isPartiallyPaid =
    Boolean(paymentSummary) &&
    paymentSummary!.paidCents > 0 &&
    paymentSummary!.outstandingCents > 0;
  const isOverdue =
    invoice.status === 'OVERDUE' || isInvoiceEffectivelyOverdue(invoice);

  if (isPartiallyPaid && isOverdue) {
    return [
      createInvoiceStatusBadge('PARTIALLY_PAID'),
      createInvoiceStatusBadge('OVERDUE'),
    ];
  }

  if (isPartiallyPaid) {
    return [createInvoiceStatusBadge('PARTIALLY_PAID')];
  }

  if (isOverdue) {
    return [createInvoiceStatusBadge('OVERDUE')];
  }

  return [createInvoiceStatusBadge(invoice.status)];
};

export const createEmailDeliveryStatusBadge = (
  status: InvoiceEmailDeliveryStatus,
) => emailDeliveryStatusBadges[status];

export const createInvoiceLineDisplays = <Line extends InvoiceLineDisplayInput>(
  lines: Line[],
) =>
  lines.map((line) => ({
    ...line,
    netCents: line.totalCents,
    taxRateLabel: formatTaxRateLabel(line.taxRateBps),
    displayTotalCents: line.totalCents + line.taxCents,
  }));

const invoiceListSortLabels: Record<InvoiceListSort, string> = {
  number: 'Number',
  issueDate: 'Issue',
  dueDate: 'Due',
  status: 'Status',
  totalCents: 'Total',
  createdAt: 'Created',
};

const statusToQueryValue = (status: InvoiceStatus) => status.toLowerCase();

const createInvoiceListUrl = (
  query: InvoiceListQuery,
  overrides: Partial<InvoiceListQuery> = {},
) => {
  const nextQuery = { ...query, ...overrides };
  const params = new URLSearchParams();

  params.set('page', String(nextQuery.page));
  params.set('limit', String(nextQuery.limit));

  if (nextQuery.q) {
    params.set('q', nextQuery.q);
  }

  if (nextQuery.status) {
    params.set('status', statusToQueryValue(nextQuery.status));
  }

  params.set('sort', nextQuery.sort);
  params.set('direction', nextQuery.direction);

  return `/invoices?${params.toString()}`;
};

const nextSortDirection = (
  query: InvoiceListQuery,
  sort: InvoiceListSort,
): InvoiceListDirection =>
  query.sort === sort && query.direction === 'asc' ? 'desc' : 'asc';

const createSortLinks = (query: InvoiceListQuery) =>
  Object.fromEntries(
    invoiceListSortableColumns.map((sort) => {
      const direction = nextSortDirection(query, sort);

      return [
        sort,
        {
          label: invoiceListSortLabels[sort],
          href: createInvoiceListUrl(query, {
            page: 1,
            sort,
            direction,
          }),
          isCurrent: query.sort === sort,
          direction: query.sort === sort ? query.direction : null,
          nextDirection: direction,
        },
      ];
    }),
  ) as Record<
    InvoiceListSort,
    {
      label: string;
      href: string;
      isCurrent: boolean;
      direction: InvoiceListDirection | null;
      nextDirection: InvoiceListDirection;
    }
  >;

const createPaginationPages = (
  query: InvoiceListQuery,
  totalPages: number,
) => {
  const start = Math.max(1, query.page - 2);
  const end = Math.min(totalPages, query.page + 2);

  return Array.from({ length: end - start + 1 }, (_, index) => {
    const page = start + index;

    return {
      page,
      href: createInvoiceListUrl(query, { page }),
      isCurrent: page === query.page,
    };
  });
};

const statusTranslationKey = (status: InvoiceStatus) =>
  statusToQueryValue(status).replace(/-/g, '_');

export const invoiceIndexView = (
  invoiceList: InvoiceList,
  t?: Translate,
) => {
  const hasActiveFilters = Boolean(invoiceList.query.q || invoiceList.query.status);
  const hasRows = invoiceList.invoices.length > 0;
  const emptyMessage =
    hasRows
      ? ''
      : invoiceList.totalCount > 0
      ? t?.('invoices.emptyState.page') ?? 'No invoices on this page.'
      : hasActiveFilters
        ? t?.('invoices.emptyState.filtered') ?? 'No invoices match these filters.'
        : t?.('invoices.emptyState.empty') ?? 'No invoices yet.';

  return {
    title: t?.('invoices.title') ?? 'Invoices',
    invoiceRows: createInvoiceTableRows(invoiceList.invoices),
    filters: {
      q: invoiceList.query.q,
      status: invoiceList.query.status
        ? statusToQueryValue(invoiceList.query.status)
        : '',
      limit: invoiceList.query.limit,
      sort: invoiceList.query.sort,
      direction: invoiceList.query.direction,
    },
    limitOptions: invoiceListLimits.map((limit) => ({
      value: String(limit),
      label: String(limit),
      selected: limit === invoiceList.query.limit,
    })),
    statusOptions: [
      {
        value: '',
        label: t?.('invoices.filters.allStatuses') ?? 'All statuses',
        selected: !invoiceList.query.status,
      },
      ...invoiceListStatusOptions.map((status) => ({
        value: statusToQueryValue(status),
        label:
          t?.(`invoices.statuses.${statusTranslationKey(status)}`) ??
          createInvoiceStatusBadge(status).label,
        selected: status === invoiceList.query.status,
      })),
    ],
    sortLinks: createSortLinks(invoiceList.query),
    pagination: {
      ...invoiceList.pagination,
      totalCount: invoiceList.totalCount,
      pages: createPaginationPages(
        invoiceList.query,
        invoiceList.pagination.totalPages,
      ),
      previousHref: invoiceList.pagination.previousPage
        ? createInvoiceListUrl(invoiceList.query, {
            page: invoiceList.pagination.previousPage,
          })
        : null,
      nextHref: invoiceList.pagination.nextPage
        ? createInvoiceListUrl(invoiceList.query, {
            page: invoiceList.pagination.nextPage,
          })
        : null,
    },
    hasActiveFilters,
    emptyMessage,
  };
};

export const createInvoiceTableRows = <Invoice extends InvoiceListItem>(
  invoices: Invoice[],
) =>
  invoices.map((invoice) => ({
    ...invoice,
    customerName:
      invoice.status !== 'DRAFT' && invoice.snapshot
        ? invoice.snapshot.customerName
        : invoice.customer.name,
    statusBadge: createInvoiceStatusBadges(invoice)[0],
    statusBadges: createInvoiceStatusBadges(invoice),
  }));

export const invoiceToFormValues = (invoice: InvoiceDetails): InvoiceFormValues => ({
  customerId: invoice.customerId,
  issueDate: dateToInputValue(invoice.issueDate),
  dueDate: dateToInputValue(invoice.dueDate),
  currency: invoice.currency,
  paymentInstructions: invoice.paymentInstructions ?? '',
  notes: invoice.notes ?? '',
  invoiceDiscountType: 'amount',
  invoiceDiscountValue: centsToAmountInput(invoice.discountCents),
  applyWithholding: invoice.withholdingType === 'IRPF',
  withholdingType: invoice.withholdingType === 'IRPF' ? 'IRPF' : '',
  ...invoiceWithholdingRateFormValues(invoice.withholdingRate),
  lines: invoice.lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: centsToAmountInput(line.unitPriceCents),
    discountType: 'amount',
    discountValue: centsToAmountInput(line.discountCents),
    taxRate: String(line.taxRateBps / 100),
  })),
});

export const createInvoiceDisplay = (invoice: InvoiceDisplaySource) => {
  const snapshot = invoice.status !== 'DRAFT' ? invoice.snapshot : null;
  const withholdingType = snapshot?.withholdingType ?? invoice.withholdingType;
  const withholdingRate = snapshot?.withholdingRate ?? invoice.withholdingRate;
  const withholdingAmountCents =
    snapshot?.withholdingAmountCents ?? invoice.withholdingAmountCents;

  const display = {
    customerName: snapshot?.customerName ?? invoice.customer.name,
    customerHref: snapshot ? null : `/customers/${invoice.customer.id}`,
    currency: invoice.currency,
    snapshot,
    isPrintable: invoice.status !== 'DRAFT' && Boolean(invoice.snapshot),
  };

  return withholdingType === 'IRPF' && withholdingAmountCents
    ? {
        ...display,
        withholding: {
          type: 'IRPF',
          rateLabel: formatRateLabel(withholdingRate),
          amountCents: withholdingAmountCents,
        },
      }
    : display;
};

export const invoiceDetailView = (
  invoice: InvoiceDetails,
  paymentValues?: InvoicePaymentValues,
  paymentErrors: InvoicePaymentErrors = {},
  metadataValues?: InvoiceMetadataValues,
  metadataErrors: InvoiceMetadataErrors = {},
  metadataEditor: InvoiceMetadataIntent | null = null,
) => {
  const paymentSummary = calculateInvoicePaymentSummary(invoice);
  const invoiceDisplay = createInvoiceDisplay(invoice);
  const isEffectivelyOverdue = isInvoiceEffectivelyOverdue(invoice);

  return {
    title: invoice.number,
    invoice,
    invoiceDisplay,
    invoiceLineDisplays: createInvoiceLineDisplays(invoice.lines),
    allowedActions: getAllowedInvoiceStatusActions(invoice.status),
    canEditInvoice: canEditInvoice(invoice.status),
    canRecordPayment:
      canRecordInvoicePayment(invoice.status) &&
      paymentSummary.outstandingCents > 0,
    isEffectivelyOverdue,
    invoiceStatusBadge: createInvoiceStatusBadges(invoice)[0],
    invoiceStatusBadges: createInvoiceStatusBadges(invoice),
    paymentSummary,
    paymentValues:
      paymentValues ??
      createInvoicePaymentValues(
        centsToAmountInput(paymentSummary.outstandingCents),
      ),
    paymentErrors,
    metadataValues:
      metadataValues ??
      createInvoiceMetadataValues(
        invoiceDisplay.snapshot?.paymentInstructions ??
          invoice.paymentInstructions ??
          '',
        invoice.notes ?? '',
      ),
    metadataErrors,
    metadataEditor,
    emailDeliveries: (invoice.emailDeliveries ?? []).map((delivery) => ({
      ...delivery,
      statusBadge: createEmailDeliveryStatusBadge(delivery.status),
    })),
  };
};

export const invoiceEmailView = (
  invoice: InvoiceDisplaySource,
  values: InvoiceEmailValues,
  errors: InvoiceEmailErrors = {},
) => ({
  title: `Email ${invoice.number}`,
  invoice,
  invoiceDisplay: createInvoiceDisplay(invoice),
  paymentSummary: calculateInvoicePaymentSummary(invoice),
  values: {
    toEmail:
      values.toEmail || createInvoiceDisplay(invoice).snapshot?.customerEmail || '',
  },
  errors,
});

export const invoicePrintView = (invoice: InvoiceDisplaySource) => {
  const invoiceDisplay = createInvoiceDisplay(invoice);

  return {
    title: `Print ${invoice.number}`,
    invoice,
    invoiceDisplay,
    invoiceLineDisplays: createInvoiceLineDisplays(invoice.lines),
    snapshot: invoiceDisplay.snapshot,
    paymentSummary: calculateInvoicePaymentSummary(invoice),
  };
};

export const publicInvoiceView = (invoice: InvoiceDisplaySource) => ({
  title: `Invoice ${invoice.number}`,
  invoice,
  invoiceDisplay: createInvoiceDisplay(invoice),
  invoiceLineDisplays: createInvoiceLineDisplays(invoice.lines),
  snapshot: createInvoiceDisplay(invoice).snapshot,
  isEffectivelyOverdue: isInvoiceEffectivelyOverdue(invoice),
  paymentSummary: calculateInvoicePaymentSummary(invoice),
  currentOrganization: invoice.organization,
});
