CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "userId" TEXT,
  "organizationId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_organizationId_idx" ON "Session"("organizationId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");
CREATE INDEX "Session_lastSeenAt_idx" ON "Session"("lastSeenAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
