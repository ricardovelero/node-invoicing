import type { RequestHandler } from "express";
import { invoiceFormSchema } from "./invoice.schema";
import { createInvoiceRecord, getInvoiceFormOptions, getInvoices } from "./invoice.service";

export const listInvoices: RequestHandler = async (_req, res) => {
  const invoices = await getInvoices();

  res.render("pages/invoices/index.njk", {
    title: "Invoices",
    invoices,
  });
};

export const renderNewInvoice: RequestHandler = async (_req, res) => {
  const customers = await getInvoiceFormOptions();

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
  const customers = await getInvoiceFormOptions();

  if (!result.success) {
    return res.status(422).render("pages/invoices/form.njk", {
      title: "New invoice",
      customers,
      values: req.body,
      errors: result.error.flatten().fieldErrors,
    });
  }

  await createInvoiceRecord(result.data);
  req.flash("success", "Invoice created.");
  res.redirect("/invoices");
};
