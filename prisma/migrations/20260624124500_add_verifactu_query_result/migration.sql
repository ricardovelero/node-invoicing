ALTER TABLE "VerifactuRecord"
  ADD COLUMN "aeatLastQueryResponseXml" TEXT,
  ADD COLUMN "aeatLastQueryResult" JSONB,
  ADD COLUMN "aeatLastQueryAt" TIMESTAMP(3),
  ADD COLUMN "aeatLastQueryEstadoRegistro" TEXT,
  ADD COLUMN "aeatLastQueryCodigoErrorRegistro" TEXT,
  ADD COLUMN "aeatLastQueryDescripcionErrorRegistro" TEXT;
