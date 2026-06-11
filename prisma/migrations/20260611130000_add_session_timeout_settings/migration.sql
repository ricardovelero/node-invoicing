ALTER TABLE "Organization"
  ADD COLUMN "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "sessionAbsoluteLifetimeDays" INTEGER NOT NULL DEFAULT 14;
