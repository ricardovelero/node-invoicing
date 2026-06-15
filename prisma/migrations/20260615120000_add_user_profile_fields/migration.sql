ALTER TABLE "User"
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "timeZone" TEXT;

UPDATE "User"
SET "fullName" = "name"
WHERE "fullName" IS NULL
  AND "name" IS NOT NULL;
