import type { RequestHandler, Response } from 'express';
import {
  createInvoiceFormValues,
  formatInvoiceMetadataErrors,
  formatInvoiceFormErrors,
  formatInvoicePaymentErrors,
  invoiceFormSchema,
  invoiceMetadataSchema,
  invoicePaymentSchema,
  invoiceStatusActionSchema,
  normalizeInvoiceMetadataValues,
  normalizeInvoiceFormValues,
  normalizeInvoicePaymentValues,
  type InvoiceFormErrors,
  type InvoiceFormValues,
  type InvoiceMetadataIntent,
} from './invoice.schema';
import {
  canEditInvoice,
  createInvoiceRecord,
  createSentInvoiceRecord,
  getInvoiceDetails,
  getInvoiceFormOptions,
  getInvoices,
  recordInvoicePayment,
  updateDraftInvoiceRecord,
  updateInvoiceMetadata,
  updateInvoiceStatus,
} from './invoice.service';
import {
  createInvoiceDisplay,
  invoiceDetailView,
  invoiceIndexView,
  invoicePrintView,
  invoiceToFormValues,
} from './invoice.presenter';
import { sendInvoiceEmail } from './invoice-email.service';

type InvoiceFormCustomers = Awaited<ReturnType<typeof getInvoiceFormOptions>>;
type InvoiceDetails = NonNullable<Awaited<ReturnType<typeof getInvoiceDetails>>>;

type InvoiceFormRenderOptions = {
  status?: number;
  title: string;
  heading?: string;
  formAction: string;
  submitLabel: string;
  sendSubmitLabel?: string;
  cancelHref: string;
  customers: InvoiceFormCustomers;
  values: InvoiceFormValues;
  errors: InvoiceFormErrors;
  formError?: string;
};

const renderInvoiceForm = (
  res: Response,
  {
    status,
    title,
    heading = title,
    formAction,
    submitLabel,
    sendSubmitLabel,
    cancelHref,
    customers,
    values,
    errors,
    formError,
  }: InvoiceFormRenderOptions,
) => {
  const response = status ? res.status(status) : res;

  return response.render('pages/invoices/form.njk', {
    title,
    heading,
    formAction,
    submitLabel,
    sendSubmitLabel,
    cancelHref,
    customers,
    values,
    errors,
    formError,
  });
};

const newInvoiceFormOptions = {
  title: 'New invoice',
  formAction: '/invoices',
  submitLabel: 'Save Draft',
  sendSubmitLabel: 'Save and send to customer',
  cancelHref: '/invoices',
};

const invoiceCreateIntentFromBody = (body: Record<string, unknown>) =>
  body.intent === 'saveAndSend' ? 'saveAndSend' : 'saveDraft';

const metadataIntentFromBody = (
  body: Record<string, unknown>,
): InvoiceMetadataIntent =>
  body.intent === 'paymentInstructions' ? 'paymentInstructions' : 'notes';

const metadataValuesAfterInvalidSubmission = (
  invoice: InvoiceDetails,
  body: Record<string, unknown>,
) => {
  const intent = metadataIntentFromBody(body);
  const submittedValues = normalizeInvoiceMetadataValues(body);
  const invoiceDisplay = createInvoiceDisplay(invoice);
  const currentValues = {
    paymentInstructions:
      invoiceDisplay.snapshot?.paymentInstructions ??
      invoice.paymentInstructions ??
      '',
    notes: invoice.notes ?? '',
  };

  return {
    ...currentValues,
    [intent]: submittedValues[intent],
  };
};

export const listInvoices: RequestHandler = async (req, res) => {
  const invoices = await getInvoices(req.auth!.organization.id);

  res.render('pages/invoices/index.njk', invoiceIndexView(invoices));
};

export const renderNewInvoice: RequestHandler = async (req, res) => {
  const customers = await getInvoiceFormOptions(req.auth!.organization.id);

  renderInvoiceForm(res, {
    ...newInvoiceFormOptions,
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
  const intent = invoiceCreateIntentFromBody(req.body);

  if (!result.success) {
    return renderInvoiceForm(res, {
      status: 422,
      ...newInvoiceFormOptions,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: formatInvoiceFormErrors(result.error),
    });
  }

  if (intent === 'saveAndSend') {
    const createResult = await createSentInvoiceRecord(
      organizationId,
      result.data,
    );

    if (!createResult.ok && createResult.reason === 'invalidCustomer') {
      return renderInvoiceForm(res, {
        status: 422,
        ...newInvoiceFormOptions,
        customers,
        values: normalizeInvoiceFormValues(req.body),
        errors: { customerId: ['Choose a customer.'] },
      });
    }

    if (!createResult.ok && createResult.reason === 'missingCustomerEmail') {
      return renderInvoiceForm(res, {
        status: 422,
        ...newInvoiceFormOptions,
        customers,
        values: normalizeInvoiceFormValues(req.body),
        errors: {
          customerId: [
            'Choose a customer with an email address before sending.',
          ],
        },
      });
    }

    if (!createResult.ok && createResult.reason === 'missingBillingEmail') {
      return renderInvoiceForm(res, {
        status: 422,
        ...newInvoiceFormOptions,
        customers,
        values: normalizeInvoiceFormValues(req.body),
        errors: {},
        formError:
          'Please, add a billing email in your organization settings before sending invoice emails.',
      });
    }

    const sendResult = await sendInvoiceEmail(
      organizationId,
      createResult.invoice.id,
      { toEmail: createResult.customerEmail },
    );
    const invoicePath = `/invoices/${createResult.invoice.id}`;

    if (!sendResult.ok && sendResult.reason === 'providerFailure') {
      req.flash(
        'error',
        `Invoice email could not be sent: ${sendResult.errorMessage}`,
      );
      return res.redirect(invoicePath);
    }

    if (!sendResult.ok) {
      req.flash('error', 'Invoice email could not be sent.');
      return res.redirect(invoicePath);
    }

    req.flash(
      'success',
      "Invoice saved and sent to the customer's email address.",
    );
    return res.redirect(invoicePath);
  }

  const createResult = await createInvoiceRecord(organizationId, result.data);

  if (!createResult.ok && createResult.reason === 'invalidCustomer') {
    return renderInvoiceForm(res, {
      status: 422,
      ...newInvoiceFormOptions,
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

  return res.render('pages/invoices/print.njk', invoicePrintView(invoice));
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

export const updateInvoiceMetadataController: RequestHandler = async (
  req,
  res,
) => {
  const invoiceId = String(req.params.invoiceId);
  const invoicePath = `/invoices/${invoiceId}`;
  const organizationId = req.auth!.organization.id;
  const result = invoiceMetadataSchema.safeParse(req.body);

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
          undefined,
          {},
          metadataValuesAfterInvalidSubmission(invoice, req.body),
          formatInvoiceMetadataErrors(result.error),
          metadataIntentFromBody(req.body),
        ),
      );
  }

  const updateResult = await updateInvoiceMetadata(
    organizationId,
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
    req.flash(
      'error',
      'Payment instructions can only be edited after the invoice snapshot exists.',
    );
    return res.redirect(invoicePath);
  }

  req.flash('success', 'Invoice details updated.');
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

  renderInvoiceForm(res, {
    title: `Edit ${invoice.number}`,
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
    return renderInvoiceForm(res, {
      status: 422,
      title: 'Edit invoice',
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
    return renderInvoiceForm(res, {
      status: 422,
      title: 'Edit invoice',
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
