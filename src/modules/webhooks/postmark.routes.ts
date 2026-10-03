import { Router } from "express";
import { createRateLimiter } from "../../middleware/rate-limit";
import { postmarkWebhookController } from "../invoices/invoice-email.controller";

export const postmarkWebhookRouter = Router();

// Generous ceiling: Postmark delivers events in bursts and retries anything throttled.
postmarkWebhookRouter.post(
  "/postmark",
  createRateLimiter({ windowMs: 60 * 1000, maxRequests: 300, keyPrefix: "postmark" }),
  postmarkWebhookController,
);
