import type { RequestHandler } from 'express';
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
    title: showingArchived ? 'Archived customers' : 'Customers',
    customers,
    showingArchived,
  });
};

export const renderNewCustomer: RequestHandler = (_req, res) => {
  renderCustomerForm(res, {
    title: 'New customer',
    heading: 'New customer',
    formAction: '/customers',
    submitLabel: 'Create customer',
    cancelHref: '/customers',
    mode: 'create',
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
        title: 'New customer',
        heading: 'New customer',
        formAction: '/customers',
        submitLabel: 'Create customer',
        cancelHref: '/customers',
        mode: 'create',
        values: req.body,
        errors: result.error.flatten().fieldErrors,
      },
      422,
    );
  }

  await createCustomerRecord(req.auth!.organization.id, result.data);
  req.flash('success', 'Customer created.');
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
      title: 'Not found',
      path: req.path,
    });
  }

  renderCustomerForm(res, {
    title: 'Edit customer',
    heading: 'Edit customer',
    formAction: `/customers/${customer.id}/edit`,
    submitLabel: 'Save changes',
    cancelHref: `/customers/${customer.id}`,
    mode: 'edit',
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
      title: 'Not found',
      path: req.path,
    });
  }

  const result = customerFormSchema.safeParse(req.body);

  if (!result.success) {
    return renderCustomerForm(
      res,
      {
        title: 'Edit customer',
        heading: 'Edit customer',
        formAction: `/customers/${customerId}/edit`,
        submitLabel: 'Save changes',
        cancelHref: `/customers/${customerId}`,
        mode: 'edit',
        values: req.body,
        errors: result.error.flatten().fieldErrors,
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
      title: 'Not found',
      path: req.path,
    });
  }

  req.flash('success', 'Customer updated.');
  res.redirect(`/customers/${customerId}`);
};

export const showCustomer: RequestHandler = async (req, res) => {
  const customer = await getCustomerDetails(
    req.auth!.organization.id,
    String(req.params.customerId),
  );

  if (!customer) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
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
    payments,
  });
};

export const deleteCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const result = await deleteCustomerRecord(req.auth!.organization.id, customerId);

  if (result === 'notFound') {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  if (result === 'hasInvoices') {
    req.flash('error', 'Customers with invoices cannot be deleted. Archive this customer instead.');
    return res.redirect(`/customers/${customerId}`);
  }

  req.flash('success', 'Customer deleted.');
  res.redirect('/customers');
};

export const archiveCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const updated = await archiveCustomerRecord(req.auth!.organization.id, customerId);

  if (updated.count === 0) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  req.flash('success', 'Customer archived.');
  res.redirect(`/customers/${customerId}`);
};

export const restoreCustomer: RequestHandler = async (req, res) => {
  const customerId = String(req.params.customerId);
  const updated = await restoreCustomerRecord(req.auth!.organization.id, customerId);

  if (updated.count === 0) {
    return res.status(404).render('pages/errors/not-found.njk', {
      title: 'Not found',
      path: req.path,
    });
  }

  req.flash('success', 'Customer restored.');
  res.redirect(`/customers/${customerId}`);
};
