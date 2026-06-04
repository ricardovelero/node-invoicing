CREATE TABLE "CatalogItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unitPriceCents" INTEGER NOT NULL,
  "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatalogItem_organizationId_idx" ON "CatalogItem"("organizationId");
CREATE INDEX "CatalogItem_name_idx" ON "CatalogItem"("name");
CREATE INDEX "CatalogItem_archivedAt_idx" ON "CatalogItem"("archivedAt");

ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
