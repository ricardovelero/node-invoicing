-- CreateEnum
CREATE TYPE "AuthAuditEventType" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_COMPLETED',
  'PASSWORD_CHANGED',
  'SESSION_REVOKED'
);

-- CreateTable
CREATE TABLE "AuthAuditEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "AuthAuditEventType" NOT NULL,
  "userId" TEXT,
  "organizationId" UUID,
  "sessionId" TEXT,
  "email" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthAuditEvent_type_idx" ON "AuthAuditEvent"("type");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_userId_idx" ON "AuthAuditEvent"("userId");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_organizationId_idx" ON "AuthAuditEvent"("organizationId");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_sessionId_idx" ON "AuthAuditEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_email_idx" ON "AuthAuditEvent"("email");

-- CreateIndex
CREATE INDEX "AuthAuditEvent_createdAt_idx" ON "AuthAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AuthAuditEvent" ADD CONSTRAINT "AuthAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAuditEvent" ADD CONSTRAINT "AuthAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
