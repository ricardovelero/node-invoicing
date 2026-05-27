import { Router } from "express";
import { createInvoice, listInvoices, renderNewInvoice } from "./invoice.controller";

export const invoiceRouter = Router();

invoiceRouter.get("/", listInvoices);
invoiceRouter.get("/new", renderNewInvoice);
invoiceRouter.post("/", createInvoice);
