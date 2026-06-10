import type { Request, RequestHandler, Response } from 'express';
import {
  createInvoiceFormValues,
  createInvoiceFormSchema,
  formatInvoiceMetadataErrors,
  formatInvoiceFormErrors,
  formatInvoicePaymentErrors,
  invoiceListQuerySchema,
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
  canUseInvoiceWithholding,
  formatRateLabel,
} from '../../lib/withholding';
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
import { generateInvoicePdfFromPrintUrl } from './invoice-pdf.service';

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
  withholdingOptions: {
    isAvailable: boolean;
    defaultRate: string;
  };
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
    withholdingOptions,
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
    withholdingOptions,
  });
};

const newInvoiceFormOptions = {
  formAction: '/invoices',
  cancelHref: '/invoices',
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const firstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  return typeof value === 'string' ? value : '';
};

const preselectedCustomerIdFromQuery = (
  query: Request['query'],
  customers: InvoiceFormCustomers,
) => {
  const customerId = firstQueryValue(query.customerId).trim();

  if (!uuidPattern.test(customerId)) {
    return undefined;
  }

  return customers.some((customer) => customer.id === customerId)
    ? customerId
    : undefined;
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

const invoicePdfFileName = (invoiceNumber: string) => {
  const safeNumber = invoiceNumber.trim().replace(/[^A-Za-z0-9._-]+/g, '-');

  return `${safeNumber || 'invoice'}.pdf`;
};

const absoluteInvoiceUrl = (req: Request, path: string) =>
  `${req.protocol}://${req.get('host')}${path}`;

type RequestOrganization = NonNullable<Request['auth']>['organization'];

const invoiceWithholdingOptions = (organization: RequestOrganization) => ({
  isAvailable: canUseInvoiceWithholding(organization),
  defaultRate: formatRateLabel(organization.defaultWithholdingRate) || '15',
});

const invoiceFormSchemaForOrganization = (organization: RequestOrganization) =>
  createInvoiceFormSchema({
    withholdingAllowed: canUseInvoiceWithholding(organization),
  });

export const listInvoices: RequestHandler = async (req, res) => {
  const query = invoiceListQuerySchema.parse(req.query);
  const invoices = await getInvoices(req.auth!.organization.id, query);

  res.render('pages/invoices/index.njk', {
    ...invoiceIndexView(invoices, req.t),
    title: req.t('invoices.title'),
  });
};

export const renderNewInvoice: RequestHandler = async (req, res) => {
  const customers = await getInvoiceFormOptions(req.auth!.organization.id);
  const values = createInvoiceFormValues(
    req.auth!.organization.paymentInstructions ?? '',
    req.auth!.organization.currency,
    invoiceWithholdingOptions(req.auth!.organization).defaultRate,
  );
  const customerId = preselectedCustomerIdFromQuery(req.query, customers);

  if (customerId) {
    values.customerId = customerId;
  }

  renderInvoiceForm(res, {
    ...newInvoiceFormOptions,
    title: req.t('invoices.form.newTitle'),
    submitLabel: req.t('invoices.actions.saveDraft'),
    sendSubmitLabel: req.t('invoices.actions.saveAndSend'),
    customers,
    values,
    errors: {},
    withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
  });
};

export const createInvoice: RequestHandler = async (req, res) => {
  const result = invoiceFormSchemaForOrganization(req.auth!.organization).safeParse(req.body);
  const organizationId = req.auth!.organization.id;
  const customers = await getInvoiceFormOptions(organizationId);
  const intent = invoiceCreateIntentFromBody(req.body);
  const newInvoiceLabels = {
    title: req.t('invoices.form.newTitle'),
    submitLabel: req.t('invoices.actions.saveDraft'),
    sendSubmitLabel: req.t('invoices.actions.saveAndSend'),
  };

  if (!result.success) {
    return renderInvoiceForm(res, {
      status: 422,
      ...newInvoiceFormOptions,
      ...newInvoiceLabels,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: formatInvoiceFormErrors(result.error),
      withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
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
        ...newInvoiceLabels,
        customers,
        values: normalizeInvoiceFormValues(req.body),
        errors: { customerId: [req.t('invoices.errors.chooseCustomer')] },
        withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
      });
    }

    if (!createResult.ok && createResult.reason === 'missingCustomerEmail') {
      return renderInvoiceForm(res, {
        status: 422,
        ...newInvoiceFormOptions,
        ...newInvoiceLabels,
        customers,
        values: normalizeInvoiceFormValues(req.body),
        errors: {
          customerId: [
            req.t('invoices.errors.chooseCustomerWithEmail'),
          ],
        },
        withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
      });
    }

    if (!createResult.ok && createResult.reason === 'missingBillingEmail') {
      return renderInvoiceForm(res, {
        status: 422,
        ...newInvoiceFormOptions,
        ...newInvoiceLabels,
        customers,
        values: normalizeInvoiceFormValues(req.body),
        errors: {},
        formError:
          req.t('invoices.errors.missingBillingEmail'),
        withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
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
        req.t('invoices.errors.emailProviderFailure', {
          message: sendResult.errorMessage,
        }),
      );
      return res.redirect(invoicePath);
    }

    if (!sendResult.ok) {
      req.flash('error', req.t('invoices.errors.emailSendFailed'));
      return res.redirect(invoicePath);
    }

    req.flash(
      'success',
      req.t('invoices.flash.savedAndSent'),
    );
    return res.redirect(invoicePath);
  }

  const createResult = await createInvoiceRecord(organizationId, result.data);

  if (!createResult.ok && createResult.reason === 'invalidCustomer') {
    return renderInvoiceForm(res, {
      status: 422,
      ...newInvoiceFormOptions,
      ...newInvoiceLabels,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: { customerId: [req.t('invoices.errors.chooseCustomer')] },
      withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
    });
  }

  req.flash('success', req.t('invoices.flash.created'));
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
    req.flash('error', req.t('invoices.errors.markSentBeforePrinting'));
    return res.redirect(`/invoices/${invoiceId}`);
  }

  return res.render('pages/invoices/print.njk', invoicePrintView(invoice));
};

export const downloadInvoicePdf: RequestHandler = async (req, res) => {
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
    req.flash('error', req.t('invoices.errors.markSentBeforePdf'));
    return res.redirect(`/invoices/${invoiceId}`);
  }

  const pdf = await generateInvoicePdfFromPrintUrl({
    cookieHeader: req.headers.cookie,
    printUrl: absoluteInvoiceUrl(req, `/invoices/${invoiceId}/print`),
  });

  return res
    .type('application/pdf')
    .attachment(invoicePdfFileName(invoice.number))
    .send(pdf);
};

export const updateInvoiceStatusController: RequestHandler = async (
  req,
  res,
) => {
  const invoiceId = String(req.params.invoiceId);
  const invoicePath = `/invoices/${invoiceId}`;
  const result = invoiceStatusActionSchema.safeParse(req.body);

  if (!result.success) {
    req.flash('error', req.t('invoices.errors.invalidStatusAction'));
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
    req.flash('error', req.t('invoices.errors.statusChangeNotAllowed'));
    return res.redirect(invoicePath);
  }

  req.flash('success', req.t('invoices.flash.statusUpdated'));
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
      req.t('invoices.errors.snapshotRequiredForPaymentInstructions'),
    );
    return res.redirect(invoicePath);
  }

  req.flash('success', req.t('invoices.flash.detailsUpdated'));
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
        amount: [req.t('invoices.errors.overpayment')],
      }),
    );
  }

  if (!paymentResult.ok) {
    req.flash('error', req.t('invoices.errors.paymentNotAllowed'));
    return res.redirect(invoicePath);
  }

  req.flash('success', req.t('invoices.flash.paymentRecorded'));
  return res.redirect(invoicePath);
};

export const renderEditInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const organizationId = req.auth!.organization.id;
  const invoice = await getInvoiceDetails(organizationId, invoiceId);

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('invoices.errors.notFound'),
      path: req.path,
    });
  }

  if (!canEditInvoice(invoice.status)) {
    req.flash('error', req.t('invoices.errors.notEditable'));
    return res.redirect(`/invoices/${invoiceId}`);
  }

  const customers = await getInvoiceFormOptions(organizationId);

  renderInvoiceForm(res, {
    title: req.t('invoices.form.editNumberTitle', {
      invoiceNumber: invoice.number,
    }),
    formAction: `/invoices/${invoiceId}/edit`,
    submitLabel: req.t('invoices.actions.save'),
    cancelHref: `/invoices/${invoiceId}`,
    customers,
    values: invoiceToFormValues(invoice),
    errors: {},
    withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
  });
};

export const editInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const organizationId = req.auth!.organization.id;
  const result = invoiceFormSchemaForOrganization(req.auth!.organization).safeParse(req.body);
  const customers = await getInvoiceFormOptions(organizationId);

  if (!result.success) {
    return renderInvoiceForm(res, {
      status: 422,
      title: req.t('invoices.form.editTitle'),
      formAction: `/invoices/${invoiceId}/edit`,
      submitLabel: req.t('invoices.actions.save'),
      cancelHref: `/invoices/${invoiceId}`,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: formatInvoiceFormErrors(result.error),
      withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
    });
  }

  const updateResult = await updateDraftInvoiceRecord(
    organizationId,
    invoiceId,
    result.data,
  );

  if (!updateResult.ok && updateResult.reason === 'notFound') {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('invoices.errors.notFound'),
      path: req.path,
    });
  }

  if (!updateResult.ok && updateResult.reason === 'notEditable') {
    req.flash('error', req.t('invoices.errors.notEditable'));
    return res.redirect(`/invoices/${invoiceId}`);
  }

  if (!updateResult.ok && updateResult.reason === 'invalidCustomer') {
    return renderInvoiceForm(res, {
      status: 422,
      title: req.t('invoices.form.editTitle'),
      formAction: `/invoices/${invoiceId}/edit`,
      submitLabel: req.t('invoices.actions.save'),
      cancelHref: `/invoices/${invoiceId}`,
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: { customerId: [req.t('invoices.errors.chooseCustomer')] },
      withholdingOptions: invoiceWithholdingOptions(req.auth!.organization),
    });
  }

  req.flash('success', req.t('invoices.flash.updated'));
  return res.redirect(`/invoices/${invoiceId}`);
};
