import { Router } from "express";
import { postmarkWebhookController } from "../invoices/invoice-email.controller";

export const postmarkWebhookRouter = Router();

postmarkWebhookRouter.post("/postmark", postmarkWebhookController);
