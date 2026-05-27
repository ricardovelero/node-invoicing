import type { RequestHandler } from "express";
import { customerFormSchema } from "./customer.schema";
import { createCustomerRecord, getCustomers } from "./customer.service";

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
