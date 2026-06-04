CREATE TYPE "InvoiceEmailDeliveryStatus" AS ENUM (
  'PENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'BOUNCED',
  'SPAM_COMPLAINT'
);

ALTER TABLE "Organization"
  ADD COLUMN "billingEmail" TEXT;

CREATE TABLE "InvoicePublicAccessToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoicePublicAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceEmailDelivery" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "publicAccessTokenId" UUID,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'postmark',
  "providerMessageId" TEXT,
  "status" "InvoiceEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "metadata" JSONB,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoiceEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceEmailEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deliveryId" UUID,
  "provider" TEXT NOT NULL DEFAULT 'postmark',
  "providerMessageId" TEXT,
  "recordType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoicePublicAccessToken_tokenHash_key"
  ON "InvoicePublicAccessToken"("tokenHash");
CREATE INDEX "InvoicePublicAccessToken_invoiceId_idx"
  ON "InvoicePublicAccessToken"("invoiceId");
CREATE INDEX "InvoicePublicAccessToken_organizationId_idx"
  ON "InvoicePublicAccessToken"("organizationId");
CREATE INDEX "InvoicePublicAccessToken_revokedAt_idx"
  ON "InvoicePublicAccessToken"("revokedAt");

CREATE INDEX "InvoiceEmailDelivery_invoiceId_idx"
  ON "InvoiceEmailDelivery"("invoiceId");
CREATE INDEX "InvoiceEmailDelivery_organizationId_idx"
  ON "InvoiceEmailDelivery"("organizationId");
CREATE INDEX "InvoiceEmailDelivery_providerMessageId_idx"
  ON "InvoiceEmailDelivery"("providerMessageId");
CREATE INDEX "InvoiceEmailDelivery_status_idx"
  ON "InvoiceEmailDelivery"("status");

CREATE INDEX "InvoiceEmailEvent_deliveryId_idx"
  ON "InvoiceEmailEvent"("deliveryId");
CREATE INDEX "InvoiceEmailEvent_providerMessageId_idx"
  ON "InvoiceEmailEvent"("providerMessageId");
CREATE INDEX "InvoiceEmailEvent_recordType_idx"
  ON "InvoiceEmailEvent"("recordType");

ALTER TABLE "InvoicePublicAccessToken"
  ADD CONSTRAINT "InvoicePublicAccessToken_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoicePublicAccessToken"
  ADD CONSTRAINT "InvoicePublicAccessToken_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceEmailDelivery"
  ADD CONSTRAINT "InvoiceEmailDelivery_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceEmailDelivery"
  ADD CONSTRAINT "InvoiceEmailDelivery_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceEmailDelivery"
  ADD CONSTRAINT "InvoiceEmailDelivery_publicAccessTokenId_fkey"
  FOREIGN KEY ("publicAccessTokenId") REFERENCES "InvoicePublicAccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceEmailEvent"
  ADD CONSTRAINT "InvoiceEmailEvent_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "InvoiceEmailDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
