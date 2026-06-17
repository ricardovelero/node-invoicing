import type { RequestHandler } from 'express';
import {
  createInvoiceEmailValues,
  invoiceEmailFormSchema,
} from './invoice-email.schema';
import {
  getEmailInvoice,
  getPublicInvoiceByToken,
  isInvoiceEmailReady,
  isValidPostmarkWebhookBasicAuth,
  recordPostmarkWebhookEvent,
  sendInvoiceEmail,
} from './invoice-email.service';
import { invoiceEmailView, publicInvoiceView } from './invoice.presenter';

export const renderInvoiceEmailForm: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoice = await getEmailInvoice(req.auth!.organization.id, invoiceId);

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  if (!isInvoiceEmailReady(invoice)) {
    req.flash('error', 'Issue the invoice before emailing it.');
    return res.redirect(`/invoices/${invoiceId}`);
  }

  return res.render(
    'pages/invoices/email.njk',
    invoiceEmailView(invoice, createInvoiceEmailValues()),
  );
};

export const sendInvoiceEmailController: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const organizationId = req.auth!.organization.id;
  const invoice = await getEmailInvoice(organizationId, invoiceId);

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  if (!isInvoiceEmailReady(invoice)) {
    req.flash('error', 'Issue the invoice before emailing it.');
    return res.redirect(`/invoices/${invoiceId}`);
  }

  const result = invoiceEmailFormSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).render(
      'pages/invoices/email.njk',
      invoiceEmailView(
        invoice,
        createInvoiceEmailValues({
          toEmail: typeof req.body.toEmail === 'string' ? req.body.toEmail : '',
        }),
        result.error.flatten().fieldErrors,
      ),
    );
  }

  const sendResult = await sendInvoiceEmail(
    organizationId,
    invoiceId,
    result.data,
  );

  if (!sendResult.ok && sendResult.reason === 'missingBillingEmail') {
    return res.status(422).render(
      'pages/invoices/email.njk',
      invoiceEmailView(invoice, createInvoiceEmailValues(result.data), {
        toEmail: [
          'Please, add a billing email in your organization settings before sending invoice emails.',
        ],
      }),
    );
  }

  if (!sendResult.ok && sendResult.reason === 'providerFailure') {
    req.flash(
      'error',
      `Invoice email could not be sent: ${sendResult.errorMessage}`,
    );
    return res.redirect(`/invoices/${invoiceId}`);
  }

  if (!sendResult.ok) {
    req.flash('error', 'Invoice email could not be sent.');
    return res.redirect(`/invoices/${invoiceId}`);
  }

  req.flash('success', 'Invoice email sent.');
  return res.redirect(`/invoices/${invoiceId}`);
};

export const showPublicInvoice: RequestHandler = async (req, res) => {
  const invoice = await getPublicInvoiceByToken(String(req.params.token));

  if (!invoice) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  return res.render(
    'pages/public/invoices/print.njk',
    publicInvoiceView(invoice),
  );
};

export const postmarkWebhookController: RequestHandler = async (req, res) => {
  if (!isValidPostmarkWebhookBasicAuth(req.get('authorization'))) {
    return res.status(403).json({ ok: false });
  }

  await recordPostmarkWebhookEvent(req.body);
  return res.status(200).json({ ok: true });
};
