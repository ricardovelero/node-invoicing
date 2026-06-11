import "express-session";

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
    ip?: string;
    organizationId?: string;
    userAgent?: string;
    userId?: string;
  }
}
