import type { RequestHandler } from 'express';
import {
  createInvoiceFormValues,
  createInvoicePaymentValues,
  formatInvoiceFormErrors,
  formatInvoicePaymentErrors,
  invoiceFormSchema,
  invoicePaymentSchema,
  invoiceStatusActionSchema,
  normalizeInvoiceFormValues,
  normalizeInvoicePaymentValues,
  type InvoicePaymentErrors,
  type InvoicePaymentValues,
} from './invoice.schema';
import {
  calculateInvoicePaymentSummary,
  canEditInvoice,
  canRecordInvoicePayment,
  createInvoiceRecord,
  getAllowedInvoiceStatusActions,
  getInvoiceDetails,
  getInvoiceFormOptions,
  getInvoices,
  isInvoiceEffectivelyOverdue,
  recordInvoicePayment,
  updateDraftInvoiceRecord,
  updateInvoiceStatus,
} from './invoice.service';

const centsToAmountInput = (amountCents: number) =>
  (amountCents / 100).toFixed(2);

const dateToInputValue = (date: Date) => date.toISOString().slice(0, 10);

const invoiceToFormValues = (
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>,
) => ({
  customerId: invoice.customerId,
  issueDate: dateToInputValue(invoice.issueDate),
  dueDate: dateToInputValue(invoice.dueDate),
  currency: invoice.currency,
  notes: invoice.notes ?? '',
  invoiceDiscountType: 'amount' as const,
  invoiceDiscountValue: centsToAmountInput(invoice.discountCents),
  lines: invoice.lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: centsToAmountInput(line.unitPriceCents),
    discountType: 'amount' as const,
    discountValue: centsToAmountInput(line.discountCents),
    taxRate: String(line.taxRateBps / 100),
  })),
});

export const createInvoiceDisplay = (
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>,
) => {
  const snapshot = invoice.status !== 'DRAFT' ? invoice.snapshot : null;

  return {
    customerName: snapshot?.customerName ?? invoice.customer.name,
    customerHref: snapshot ? null : `/customers/${invoice.customer.id}`,
    currency: invoice.currency,
    snapshot,
    isPrintable: invoice.status !== 'DRAFT' && Boolean(invoice.snapshot),
  };
};

const invoiceDetailView = (
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>,
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

export const listInvoices: RequestHandler = async (req, res) => {
  const invoices = await getInvoices(req.auth!.organization.id);

  res.render('pages/invoices/index.njk', {
    title: 'Invoices',
    invoices,
  });
};

export const renderNewInvoice: RequestHandler = async (req, res) => {
  const customers = await getInvoiceFormOptions(req.auth!.organization.id);

  res.render('pages/invoices/form.njk', {
    title: 'New invoice',
    heading: 'New invoice',
    formAction: '/invoices',
    submitLabel: 'Create invoice',
    cancelHref: '/invoices',
    customers,
    values: createInvoiceFormValues(
      req.auth!.organization.paymentInstructions ?? '',
      req.auth!.organization.currency,
    ),
    errors: {},
  });
};

export const createInvoice: RequestHandler = async (req, res) => {
  const result = invoiceFormSchema.safeParse(req.body);
  const organizationId = req.auth!.organization.id;
  const customers = await getInvoiceFormOptions(organizationId);

  if (!result.success) {
    return res.status(422).render('pages/invoices/form.njk', {
      title: 'New invoice',
      heading: 'New invoice',
      formAction: '/invoices',
      submitLabel: 'Create invoice',
      cancelHref: '/invoices',
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: formatInvoiceFormErrors(result.error),
    });
  }

  const invoice = await createInvoiceRecord(organizationId, result.data);

  if (!invoice) {
    return res.status(422).render('pages/invoices/form.njk', {
      title: 'New invoice',
      heading: 'New invoice',
      formAction: '/invoices',
      submitLabel: 'Create invoice',
      cancelHref: '/invoices',
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: { customerId: ['Choose a customer.'] },
    });
  }

  req.flash('success', 'Invoice created.');
  res.redirect('/invoices');
};

export const showInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoice = await getInvoiceDetails(req.auth!.organization.id, invoiceId);

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  res.render('pages/invoices/detail.njk', invoiceDetailView(invoice));
};

export const printInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoice = await getInvoiceDetails(req.auth!.organization.id, invoiceId);

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  const invoiceDisplay = createInvoiceDisplay(invoice);

  if (!invoiceDisplay.isPrintable || !invoiceDisplay.snapshot) {
    req.flash('error', 'Mark the invoice sent before printing.');
    return res.redirect(`/invoices/${invoiceId}`);
  }

  return res.render('pages/invoices/print.njk', {
    title: `Print ${invoice.number}`,
    invoice,
    invoiceDisplay,
    snapshot: invoiceDisplay.snapshot,
  });
};

export const updateInvoiceStatusController: RequestHandler = async (
  req,
  res,
) => {
  const invoiceId = String(req.params.invoiceId);
  const invoicePath = `/invoices/${invoiceId}`;
  const result = invoiceStatusActionSchema.safeParse(req.body);

  if (!result.success) {
    req.flash(
      'error',
      result.error.issues[0]?.message ??
        'Choose a valid invoice status action.',
    );
    return res.redirect(invoicePath);
  }

  const updateResult = await updateInvoiceStatus(
    req.auth!.organization.id,
    invoiceId,
    result.data,
  );

  if (!updateResult.ok && updateResult.reason === 'notFound') {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  if (!updateResult.ok) {
    req.flash('error', 'That status change is not allowed for this invoice.');
    return res.redirect(invoicePath);
  }

  req.flash('success', 'Invoice status updated.');
  return res.redirect(invoicePath);
};

export const recordInvoicePaymentController: RequestHandler = async (
  req,
  res,
) => {
  const invoiceId = String(req.params.invoiceId);
  const invoicePath = `/invoices/${invoiceId}`;
  const organizationId = req.auth!.organization.id;
  const result = invoicePaymentSchema.safeParse(req.body);

  if (!result.success) {
    const invoice = await getInvoiceDetails(organizationId, invoiceId);

    if (!invoice) {
      return res.status(404).render('pages/errors/not-found.njk', {
        title: 'Not found',
        path: req.path,
      });
    }

    return res
      .status(422)
      .render(
        'pages/invoices/detail.njk',
        invoiceDetailView(
          invoice,
          normalizeInvoicePaymentValues(req.body),
          formatInvoicePaymentErrors(result.error),
        ),
      );
  }

  const paymentResult = await recordInvoicePayment(
    organizationId,
    invoiceId,
    result.data,
  );

  if (!paymentResult.ok && paymentResult.reason === 'notFound') {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  if (!paymentResult.ok && paymentResult.reason === 'overpayment') {
    const invoice = await getInvoiceDetails(organizationId, invoiceId);

    if (!invoice) {
      return res.status(404).render('pages/errors/not-found.njk', {
        title: 'Not found',
        path: req.path,
      });
    }

    return res.status(422).render(
      'pages/invoices/detail.njk',
      invoiceDetailView(invoice, normalizeInvoicePaymentValues(req.body), {
        amount: ['Payment cannot exceed the outstanding balance.'],
      }),
    );
  }

  if (!paymentResult.ok) {
    req.flash('error', 'Payments can only be recorded for open invoices.');
    return res.redirect(invoicePath);
  }

  req.flash('success', 'Payment recorded.');
  return res.redirect(invoicePath);
};

export const renderEditInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const organizationId = req.auth!.organization.id;
  const invoice = await getInvoiceDetails(organizationId, invoiceId);

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Invoice Not Found',
      path: req.path,
    });
  }

  if (!canEditInvoice(invoice.status)) {
    req.flash('error', 'Only draft invoices can be edited.');
    return res.redirect(`/invoices/${invoiceId}`);
  }

  const customers = await getInvoiceFormOptions(organizationId);

  res.render('pages/invoices/form.njk', {
    title: `Edit ${invoice.number}`,
    heading: `Edit ${invoice.number}`,
    formAction: `/invoices/${invoiceId}/edit`,
    submitLabel: 'Save invoice',
    cancelHref: `/invoices/${invoiceId}`,
    customers,
    values: invoiceToFormValues(invoice),
    errors: {},
  });
};

export const editInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const organizationId = req.auth!.organization.id;
  const result = invoiceFormSchema.safeParse(req.body);
  const customers = await getInvoiceFormOptions(organizationId);

  if (!result.success) {
    return res.status(422).render('pages/invoices/form.njk', {
      title: 'Edit invoice',
      heading: 'Edit invoice',
      formAction: `/invoices/${invoiceId}/edit`,
      submitLabel: 'Save invoice',
      cancelHref: `/invoices/${invoiceId}`,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: formatInvoiceFormErrors(result.error),
    });
  }

  const updateResult = await updateDraftInvoiceRecord(
    organizationId,
    invoiceId,
    result.data,
  );

  if (!updateResult.ok && updateResult.reason === 'notFound') {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Invoice Not Found',
      path: req.path,
    });
  }

  if (!updateResult.ok && updateResult.reason === 'notEditable') {
    req.flash('error', 'Only draft invoices can be edited.');
    return res.redirect(`/invoices/${invoiceId}`);
  }

  if (!updateResult.ok && updateResult.reason === 'invalidCustomer') {
    return res.status(422).render('pages/invoices/form.njk', {
      title: 'Edit invoice',
      heading: 'Edit invoice',
      formAction: `/invoices/${invoiceId}/edit`,
      submitLabel: 'Save invoice',
      cancelHref: `/invoices/${invoiceId}`,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: { customerId: ['Choose a customer.'] },
    });
  }

  req.flash('success', 'Invoice updated.');
  return res.redirect(`/invoices/${invoiceId}`);
};
