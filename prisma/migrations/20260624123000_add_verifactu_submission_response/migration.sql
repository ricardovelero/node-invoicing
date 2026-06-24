ALTER TABLE "VerifactuRecord"
  ADD COLUMN "aeatSubmissionResponseXml" TEXT,
  ADD COLUMN "aeatSubmissionResult" JSONB,
  ADD COLUMN "aeatEstadoEnvio" TEXT,
  ADD COLUMN "aeatEstadoRegistro" TEXT,
  ADD COLUMN "aeatCodigoErrorRegistro" TEXT,
  ADD COLUMN "aeatDescripcionErrorRegistro" TEXT;
