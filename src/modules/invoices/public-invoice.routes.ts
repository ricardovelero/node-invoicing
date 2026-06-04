import { Router } from "express";
import { showPublicInvoice } from "./invoice-email.controller";

export const publicInvoiceRouter = Router();

publicInvoiceRouter.get("/:token", showPublicInvoice);
