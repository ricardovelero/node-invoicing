import type { RequestHandler } from "express";
import { customerFormSchema } from "./customer.schema";
import { createCustomerRecord, getCustomerDetails, getCustomers } from "./customer.service";

export const listCustomers: RequestHandler = async (req, res) => {
  const customers = await getCustomers(req.auth!.organization.id);

  res.render("pages/customers/index.njk", {
    title: "Customers",
    customers,
  });
};

export const renderNewCustomer: RequestHandler = (_req, res) => {
  res.render("pages/customers/form.njk", {
    title: "New customer",
    values: {},
    errors: {},
  });
};

export const createCustomer: RequestHandler = async (req, res) => {
  const result = customerFormSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).render("pages/customers/form.njk", {
      title: "New customer",
      values: req.body,
      errors: result.error.flatten().fieldErrors,
    });
  }

  await createCustomerRecord(req.auth!.organization.id, result.data);
  req.flash("success", "Customer created.");
  res.redirect("/customers");
};

export const showCustomer: RequestHandler = async (req, res) => {
  const customer = await getCustomerDetails(
    req.auth!.organization.id,
    String(req.params.customerId),
  );

  if (!customer) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
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

  res.render("pages/customers/detail.njk", {
    title: customer.name,
    customer,
    payments,
  });
};
