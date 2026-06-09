import type { RequestHandler } from 'express';
import type { Translate } from '../../lib/i18n';
import { createInvoiceStatusBadges } from '../invoices/invoice.presenter';
import type { CustomerForm } from './customer.schema';
import { customerFormSchema } from './customer.schema';
import {
  archiveCustomerRecord,
  createCustomerRecord,
  deleteCustomerRecord,
  getCustomerDetails,
  getCustomerForEdit,
  getCustomers,
  restoreCustomerRecord,
  updateCustomerRecord,
} from './customer.service';

type CustomerFormView = {
  title: string;
  heading: string;
  formAction: string;
  submitLabel: string;
  cancelHref: string;
  mode: 'create' | 'edit';
  values: Partial<CustomerForm>;
  errors: Record<string, string[] | undefined>;
};

const customerFormLabels = (t: Translate) => ({
  title: t('customers.form.newTitle'),
  heading: t('customers.form.newTitle'),
  formAction: '/customers',
  submitLabel: t('customers.actions.create'),
  cancelHref: '/customers',
  mode: 'create' as const,
});

const customerEditFormLabels = (
  t: Translate,
  customerId: string,
) => ({
  title: t('customers.form.editTitle'),
  heading: t('customers.form.editTitle'),
  formAction: `/customers/${customerId}/edit`,
  submitLabel: t('customers.actions.saveChanges'),
  cancelHref: `/customers/${customerId}`,
  mode: 'edit' as const,
});

const translateCustomerFormErrors = (
  t: Translate,
  errors: Record<string, string[] | undefined>,
) => ({
  ...errors,
  name: errors.name?.map((message) =>
    message === 'Customer name is required.'
      ? t('customers.errors.nameRequired')
      : message,
  ),
  email: errors.email?.map((message) =>
    message === 'Use a valid email address.'
      ? t('customers.errors.invalidEmail')
      : message,
  ),
});

const renderCustomerForm = (
  res: Parameters<RequestHandler>[1],
  view: CustomerFormView,
  statusCode?: number,
) => {
  if (statusCode) {
    return res.status(statusCode).render('pages/customers/form.njk', view);
  }

  return res.render('pages/customers/form.njk', view);
};

export const listCustomers: RequestHandler = async (req, res) => {
  const showingArchived = req.query.archived === '1';
  const customers = await getCustomers(req.auth!.organization.id, {
    archived: showingArchived,
  });

  res.render('pages/customers/index.njk', {
    title: showingArchived
      ? req.t('customers.archivedTitle')
      : req.t('customers.title'),
    customers,
    showingArchived,
  });
};

export const renderNewCustomer: RequestHandler = (req, res) => {
  renderCustomerForm(res, {
    ...customerFormLabels(req.t),
    values: {},
    errors: {},
  });
};

export const createCustomer: RequestHandler = async (req, res) => {
  const result = customerFormSchema.safeParse(req.body);

  if (!result.success) {
    return renderCustomerForm(
      res,
      {
        ...customerFormLabels(req.t),
        values: req.body,
        errors: translateCustomerFormErrors(
          req.t,
          result.error.flatten().fieldErrors,
        ),
      },
      422,
    );
  }

  await createCustomerRecord(req.auth!.organization.id, result.data);
  req.flash('success', req.t('customers.flash.created'));
  res.redirect('/customers');
};

export const renderEditCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const customer = await getCustomerForEdit(
    req.auth!.organization.id,
    customerId,
  );

  if (!customer) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  renderCustomerForm(res, {
    ...customerEditFormLabels(req.t, customer.id),
    values: {
      name: customer.name,
      email: customer.email || '',
      taxId: customer.taxId || '',
      addressLine1: customer.addressLine1 || '',
      city: customer.city || '',
      country: customer.country || '',
    },
    errors: {},
  });
};

export const updateCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const customer = await getCustomerForEdit(
    req.auth!.organization.id,
    customerId,
  );

  if (!customer) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  const result = customerFormSchema.safeParse(req.body);

  if (!result.success) {
    return renderCustomerForm(
      res,
      {
        ...customerEditFormLabels(req.t, customerId),
        values: req.body,
        errors: translateCustomerFormErrors(
          req.t,
          result.error.flatten().fieldErrors,
        ),
      },
      422,
    );
  }

  const updated = await updateCustomerRecord(
    req.auth!.organization.id,
    customerId,
    result.data,
  );

  if (updated.count === 0) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  req.flash('success', req.t('customers.flash.updated'));
  res.redirect(`/customers/${customerId}`);
};

export const showCustomer: RequestHandler = async (req, res) => {
  const customer = await getCustomerDetails(
    req.auth!.organization.id,
    String(req.params.customerId),
  );

  if (!customer) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  const payments = customer.invoices
    .flatMap((invoice) =>
      invoice.payments.map((payment) => ({
        ...payment,
        invoice,
      })),
    )
    .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime());

  res.render('pages/customers/detail.njk', {
    title: customer.name,
    customer,
    invoiceRows: customer.invoices.map((invoice) => ({
      ...invoice,
      statusBadge: createInvoiceStatusBadges(invoice)[0],
      statusBadges: createInvoiceStatusBadges(invoice),
    })),
    payments,
  });
};

export const deleteCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const result = await deleteCustomerRecord(req.auth!.organization.id, customerId);

  if (result === 'notFound') {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  if (result === 'hasInvoices') {
    req.flash('error', req.t('customers.errors.deleteHasInvoices'));
    return res.redirect(`/customers/${customerId}`);
  }

  req.flash('success', req.t('customers.flash.deleted'));
  res.redirect('/customers');
};

export const archiveCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const updated = await archiveCustomerRecord(req.auth!.organization.id, customerId);

  if (updated.count === 0) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  req.flash('success', req.t('customers.flash.archived'));
  res.redirect(`/customers/${customerId}`);
};

export const restoreCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const updated = await restoreCustomerRecord(req.auth!.organization.id, customerId);

  if (updated.count === 0) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: req.t('customers.errors.notFound'),
      path: req.path,
    });
  }

  req.flash('success', req.t('customers.flash.restored'));
  res.redirect(`/customers/${customerId}`);
};
