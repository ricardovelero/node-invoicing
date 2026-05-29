import type { RequestHandler } from "express";
import {
  createInvoiceFormValues,
  formatInvoiceFormErrors,
  invoiceFormSchema,
  invoiceStatusActionSchema,
  normalizeInvoiceFormValues,
} from "./invoice.schema";
import {
  createInvoiceRecord,
  getAllowedInvoiceStatusActions,
  getInvoiceDetails,
  getInvoiceFormOptions,
  getInvoices,
  isInvoiceEffectivelyOverdue,
  updateInvoiceStatus,
} from "./invoice.service";

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
    values: createInvoiceFormValues(req.auth!.organization.paymentInstructions ?? ""),
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
      values: normalizeInvoiceFormValues(req.body),
      errors: formatInvoiceFormErrors(result.error),
    });
  }

  const invoice = await createInvoiceRecord(organizationId, result.data);

  if (!invoice) {
    return res.status(422).render("pages/invoices/form.njk", {
      title: "New invoice",
      customers,
      values: normalizeInvoiceFormValues(req.body),
      errors: { customerId: ["Choose a customer."] },
    });
  }

  req.flash("success", "Invoice created.");
  res.redirect("/invoices");
};

export const showInvoice: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoice = await getInvoiceDetails(req.auth!.organization.id, invoiceId);

  if (!invoice) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  res.render("pages/invoices/detail.njk", {
    title: invoice.number,
    invoice,
    allowedActions: getAllowedInvoiceStatusActions(invoice.status),
    isEffectivelyOverdue: isInvoiceEffectivelyOverdue(invoice),
    paidAtDefault: new Date().toISOString().slice(0, 10),
  });
};

export const updateInvoiceStatusController: RequestHandler = async (req, res) => {
  const invoiceId = String(req.params.invoiceId);
  const invoicePath = `/invoices/${invoiceId}`;
  const result = invoiceStatusActionSchema.safeParse(req.body);

  if (!result.success) {
    req.flash("error", result.error.issues[0]?.message ?? "Choose a valid invoice status action.");
    return res.redirect(invoicePath);
  }

  const updateResult = await updateInvoiceStatus(
    req.auth!.organization.id,
    invoiceId,
    result.data,
  );

  if (!updateResult.ok && updateResult.reason === "notFound") {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  if (!updateResult.ok) {
    req.flash("error", "That status change is not allowed for this invoice.");
    return res.redirect(invoicePath);
  }

  req.flash("success", "Invoice status updated.");
  return res.redirect(invoicePath);
};
