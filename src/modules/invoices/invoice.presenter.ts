import type { InvoiceEmailDeliveryStatus, InvoiceStatus } from '@prisma/client';
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

const invoiceStatusBadges: Record<
  InvoiceStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SENT: { label: 'Sent', variant: 'info' },
  PARTIALLY_PAID: { label: 'Partially paid', variant: 'warning' },
  PAID: { label: 'Paid', variant: 'success' },
  OVERDUE: { label: 'Overdue', variant: 'danger' },
  VOID: { label: 'Void', variant: 'muted' },
};

const emailDeliveryStatusBadges: Record<
  InvoiceEmailDeliveryStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING: { label: 'Pending', variant: 'warning' },
  SENT: { label: 'Sent', variant: 'info' },
  DELIVERED: { label: 'Delivered', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  BOUNCED: { label: 'Bounced', variant: 'danger' },
  SPAM_COMPLAINT: { label: 'Spam complaint', variant: 'danger' },
};

export const createInvoiceStatusBadge = (status: InvoiceStatus) =>
  invoiceStatusBadges[status];

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

export const invoiceIndexView = (invoiceList: InvoiceList) => {
  const hasActiveFilters = Boolean(invoiceList.query.q || invoiceList.query.status);
  const hasRows = invoiceList.invoices.length > 0;
  const emptyMessage =
    hasRows
      ? ''
      : invoiceList.totalCount > 0
      ? 'No invoices on this page.'
      : hasActiveFilters
        ? 'No invoices match these filters.'
        : 'No invoices yet.';

  return {
    title: 'Invoices',
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
      { value: '', label: 'All statuses', selected: !invoiceList.query.status },
      ...invoiceListStatusOptions.map((status) => ({
        value: statusToQueryValue(status),
        label: createInvoiceStatusBadge(status).label,
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
    statusBadge: createInvoiceStatusBadge(invoice.status),
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

  return {
    customerName: snapshot?.customerName ?? invoice.customer.name,
    customerHref: snapshot ? null : `/customers/${invoice.customer.id}`,
    currency: invoice.currency,
    snapshot,
    isPrintable: invoice.status !== 'DRAFT' && Boolean(invoice.snapshot),
  };
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
    invoiceStatusBadge: createInvoiceStatusBadge(
      isEffectivelyOverdue ? 'OVERDUE' : invoice.status,
    ),
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
