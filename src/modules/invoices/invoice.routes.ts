import { Router } from "express";
import {
  createInvoice,
  listInvoices,
  printInvoice,
  recordInvoicePaymentController,
  renderNewInvoice,
  showInvoice,
  updateInvoiceStatusController,
} from "./invoice.controller";

export const invoiceRouter = Router();

invoiceRouter.get("/", listInvoices);
invoiceRouter.get("/new", renderNewInvoice);
invoiceRouter.post("/", createInvoice);
invoiceRouter.get("/:invoiceId/print", printInvoice);
invoiceRouter.get("/:invoiceId", showInvoice);
invoiceRouter.post("/:invoiceId/status", updateInvoiceStatusController);
invoiceRouter.post("/:invoiceId/payments", recordInvoicePaymentController);
