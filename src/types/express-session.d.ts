import "express-session";

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
    ip?: string;
    organizationId?: string;
    sessionAbsoluteLifetimeDays?: number;
    sessionIdleTimeoutMinutes?: number;
    userAgent?: string;
    userId?: string;
  }
}
