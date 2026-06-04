ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "currency" TEXT;

UPDATE "CatalogItem"
SET "currency" = "Organization"."currency"
FROM "Organization"
WHERE "CatalogItem"."organizationId" = "Organization"."id"
  AND "CatalogItem"."currency" IS NULL;

UPDATE "CatalogItem"
SET "currency" = 'EUR'
WHERE "currency" IS NULL;

ALTER TABLE "CatalogItem" ALTER COLUMN "currency" SET NOT NULL;
