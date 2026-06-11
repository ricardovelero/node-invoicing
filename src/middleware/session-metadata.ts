import type { Request, RequestHandler } from 'express';

const maxUserAgentLength = 512;
const maxIpLength = 128;

const sanitizeSessionMetadata = (
  value: string | undefined,
  maxLength: number,
) => {
  if (!value) {
    return undefined;
  }

  const sanitized = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();

  return sanitized ? sanitized.slice(0, maxLength) : undefined;
};

export const applySessionMetadata = (req: Request) => {
  req.session.userAgent ??= sanitizeSessionMetadata(
    req.get('user-agent'),
    maxUserAgentLength,
  );
  req.session.ip ??= sanitizeSessionMetadata(req.ip, maxIpLength);
};

export const captureSessionMetadata: RequestHandler = (req, _res, next) => {
  applySessionMetadata(req);
  next();
};
