import { randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const csrfFieldName = "_csrf";
export const csrfErrorMessage = "Invalid CSRF token. Please refresh the page and try again.";

const createCsrfToken = () => randomBytes(32).toString("hex");

const readSubmittedToken = (body: unknown) => {
  if (!body || typeof body !== "object") {
    return "";
  }

  const token = (body as Record<string, unknown>)[csrfFieldName];

  return typeof token === "string" ? token : "";
};

const isValidCsrfToken = (submittedToken: string, sessionToken: string) => {
  const submittedBuffer = Buffer.from(submittedToken);
  const sessionBuffer = Buffer.from(sessionToken);

  if (submittedBuffer.length !== sessionBuffer.length) {
    timingSafeEqual(sessionBuffer, Buffer.alloc(sessionBuffer.length));
    return false;
  }

  return timingSafeEqual(submittedBuffer, sessionBuffer);
};

export const csrfProtection: RequestHandler = (req, res, next) => {
  req.session.csrfToken ??= createCsrfToken();
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method !== "POST") {
    return next();
  }

  const submittedToken = readSubmittedToken(req.body);

  if (isValidCsrfToken(submittedToken, req.session.csrfToken)) {
    return next();
  }

  const error = Object.assign(new Error(csrfErrorMessage), { status: 403 });

  return next(error);
};
