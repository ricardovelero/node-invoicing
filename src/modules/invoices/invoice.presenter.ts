import {
  createInvoicePaymentValues,
  type InvoiceFormValues,
  type InvoicePaymentErrors,
  type InvoicePaymentValues,
} from './invoice.schema';
import {
  calculateInvoicePaymentSummary,
  canEditInvoice,
  canRecordInvoicePayment,
  getAllowedInvoiceStatusActions,
  type getInvoiceDetails,
  isInvoiceEffectivelyOverdue,
} from './invoice.service';

type InvoiceDetails = NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>;

const centsToAmountInput = (amountCents: number) =>
  (amountCents / 100).toFixed(2);

const dateToInputValue = (date: Date) => date.toISOString().slice(0, 10);

export const invoiceToFormValues = (invoice: InvoiceDetails): InvoiceFormValues => ({
  customerId: invoice.customerId,
  issueDate: dateToInputValue(invoice.issueDate),
  dueDate: dateToInputValue(invoice.dueDate),
  currency: invoice.currency,
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

export const createInvoiceDisplay = (invoice: InvoiceDetails) => {
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
) => {
  const paymentSummary = calculateInvoicePaymentSummary(invoice);

  return {
    title: invoice.number,
    invoice,
    invoiceDisplay: createInvoiceDisplay(invoice),
    allowedActions: getAllowedInvoiceStatusActions(invoice.status),
    canEditInvoice: canEditInvoice(invoice.status),
    canRecordPayment:
      canRecordInvoicePayment(invoice.status) &&
      paymentSummary.outstandingCents > 0,
    isEffectivelyOverdue: isInvoiceEffectivelyOverdue(invoice),
    paymentSummary,
    paymentValues:
      paymentValues ??
      createInvoicePaymentValues(
        centsToAmountInput(paymentSummary.outstandingCents),
      ),
    paymentErrors,
  };
};
