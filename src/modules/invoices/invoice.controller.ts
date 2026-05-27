import type { RequestHandler } from "express";
import { invoiceFormSchema } from "./invoice.schema";
import { createInvoiceRecord, getInvoiceFormOptions, getInvoices } from "./invoice.service";

export const listInvoices: RequestHandler = async (req, res) => {
  const invoices = await getInvoices(req.auth!.organization.id);

  res.render("pages/invoices/index.njk", {
    title: "Invoices",
    invoices,
  });
};

export const renderNewInvoice: RequestHandler = async (req, res) => {
  const customers = await getInvoiceFormOptions(req.auth!.organization.id);

  res.render("pages/invoices/form.njk", {
    title: "New invoice",
    customers,
    values: {
      issueDate: new Date().toISOString().slice(0, 10),
    },
    errors: {},
  });
};

export const createInvoice: RequestHandler = async (req, res) => {
  const result = invoiceFormSchema.safeParse(req.body);
  const organizationId = req.auth!.organization.id;
  const customers = await getInvoiceFormOptions(organizationId);

  if (!result.success) {
    return res.status(422).render("pages/invoices/form.njk", {
      title: "New invoice",
      customers,
      values: req.body,
      errors: result.error.flatten().fieldErrors,
    });
  }

  const invoice = await createInvoiceRecord(organizationId, result.data);

  if (!invoice) {
    return res.status(422).render("pages/invoices/form.njk", {
      title: "New invoice",
      customers,
      values: req.body,
      errors: { customerId: ["Choose a customer."] },
    });
  }

  req.flash("success", "Invoice created.");
  res.redirect("/invoices");
};
