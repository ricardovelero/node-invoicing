CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "InvoiceFiscalRecord"
  ADD COLUMN "previousRecordId" UUID,
  ADD COLUMN "previousHash" TEXT,
  ADD COLUMN "hash" TEXT,
  ADD COLUMN "hashInput" JSONB,
  ADD COLUMN "hashVersion" TEXT NOT NULL DEFAULT 'internal-v1';

CREATE OR REPLACE FUNCTION "__asienta_canonical_jsonb"(input_json JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  canonical TEXT;
BEGIN
  CASE jsonb_typeof(input_json)
    WHEN 'object' THEN
      -- Sort keys bytewise (COLLATE "C") to match the TypeScript canonicalizer,
      -- which orders keys by code point. A locale-aware default collation could
      -- order the same keys differently and produce a non-matching hash.
      SELECT '{' || string_agg(
        to_jsonb(entry.key)::text || ':' || "__asienta_canonical_jsonb"(entry.value),
        ',' ORDER BY entry.key COLLATE "C"
      ) || '}'
      INTO canonical
      FROM jsonb_each(input_json) AS entry(key, value);

      RETURN COALESCE(canonical, '{}');
    WHEN 'array' THEN
      SELECT '[' || string_agg(
        "__asienta_canonical_jsonb"(element.value),
        ',' ORDER BY element.ordinality
      ) || ']'
      INTO canonical
      FROM jsonb_array_elements(input_json) WITH ORDINALITY AS element(value, ordinality);

      RETURN COALESCE(canonical, '[]');
    ELSE
      RETURN input_json::text;
  END CASE;
END;
$$;

WITH RECURSIVE ordered_records AS (
  SELECT
    fiscal_record."id",
    fiscal_record."organizationId" AS organization_id,
    fiscal_record."invoiceId" AS invoice_id,
    fiscal_record."type"::text AS record_type,
    fiscal_record."sequenceNumber" AS sequence_number,
    lag(fiscal_record."id") OVER (
      PARTITION BY fiscal_record."organizationId"
      ORDER BY fiscal_record."sequenceNumber"
    ) AS previous_record_id,
    row_number() OVER (
      PARTITION BY fiscal_record."organizationId"
      ORDER BY fiscal_record."sequenceNumber"
    ) AS chain_position,
    invoice."number" AS invoice_number,
    CASE fiscal_record."type"::text
      WHEN 'ALTA' THEN 'ISSUED'
      WHEN 'ANULACION' THEN 'VOID'
      ELSE invoice."status"::text
    END AS invoice_status,
    to_char(invoice."issueDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS issue_date,
    to_char(invoice."dueDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS due_date,
    invoice."currency",
    COALESCE(snapshot."subtotalCents", invoice."subtotalCents") AS subtotal_cents,
    COALESCE(snapshot."discountCents", invoice."discountCents") AS discount_cents,
    COALESCE(snapshot."taxCents", invoice."taxCents") AS tax_cents,
    COALESCE(snapshot."withholdingType", invoice."withholdingType") AS withholding_type,
    CASE
      WHEN COALESCE(snapshot."withholdingRate", invoice."withholdingRate") IS NULL
        THEN NULL
      ELSE COALESCE(snapshot."withholdingRate", invoice."withholdingRate")::text
    END AS withholding_rate,
    COALESCE(
      snapshot."withholdingAmountCents",
      invoice."withholdingAmountCents"
    ) AS withholding_amount_cents,
    COALESCE(snapshot."totalCents", invoice."totalCents") AS total_cents,
    CASE
      WHEN snapshot."invoiceId" IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object(
        'sellerName', snapshot."sellerName",
        'sellerLegalName', snapshot."sellerLegalName",
        'sellerTaxId', snapshot."sellerTaxId",
        'sellerAddressLine1', snapshot."sellerAddressLine1",
        'sellerCity', snapshot."sellerCity",
        'sellerCountry', snapshot."sellerCountry",
        'customerName', snapshot."customerName",
        'customerEmail', snapshot."customerEmail",
        'customerTaxId', snapshot."customerTaxId",
        'customerAddressLine1', snapshot."customerAddressLine1",
        'customerCity', snapshot."customerCity",
        'customerCountry', snapshot."customerCountry"
      )
    END AS snapshot
  FROM "InvoiceFiscalRecord" AS fiscal_record
  INNER JOIN "Invoice" AS invoice
    ON invoice."id" = fiscal_record."invoiceId"
  LEFT JOIN "InvoiceSnapshot" AS snapshot
    ON snapshot."invoiceId" = invoice."id"
),
fiscal_record_chain (
  id,
  organization_id,
  previous_record_id,
  previous_hash,
  hash_input,
  hash,
  chain_position
) AS (
  SELECT
    ordered_records.id,
    ordered_records.organization_id,
    ordered_records.previous_record_id,
    NULL::text AS previous_hash,
    hash_payload.hash_input,
    encode(
      digest("__asienta_canonical_jsonb"(hash_payload.hash_input), 'sha256'),
      'hex'
    ) AS hash,
    ordered_records.chain_position
  FROM ordered_records
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'hashVersion', 'internal-v1',
      'organizationId', ordered_records.organization_id,
      'invoiceId', ordered_records.invoice_id,
      'invoiceNumber', ordered_records.invoice_number,
      'recordType', ordered_records.record_type,
      'sequenceNumber', ordered_records.sequence_number,
      'previousHash', NULL,
      'invoiceStatus', ordered_records.invoice_status,
      'issueDate', ordered_records.issue_date,
      'dueDate', ordered_records.due_date,
      'currency', ordered_records.currency,
      'subtotalCents', ordered_records.subtotal_cents,
      'discountCents', ordered_records.discount_cents,
      'taxCents', ordered_records.tax_cents,
      'withholdingType', ordered_records.withholding_type,
      'withholdingRate', ordered_records.withholding_rate,
      'withholdingAmountCents', ordered_records.withholding_amount_cents,
      'totalCents', ordered_records.total_cents,
      'snapshot', ordered_records.snapshot
    ) AS hash_input
  ) AS hash_payload
  WHERE ordered_records.chain_position = 1

  UNION ALL

  SELECT
    ordered_records.id,
    ordered_records.organization_id,
    ordered_records.previous_record_id,
    fiscal_record_chain.hash AS previous_hash,
    hash_payload.hash_input,
    encode(
      digest("__asienta_canonical_jsonb"(hash_payload.hash_input), 'sha256'),
      'hex'
    ) AS hash,
    ordered_records.chain_position
  FROM fiscal_record_chain
  INNER JOIN ordered_records
    ON ordered_records.organization_id = fiscal_record_chain.organization_id
    AND ordered_records.chain_position = fiscal_record_chain.chain_position + 1
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'hashVersion', 'internal-v1',
      'organizationId', ordered_records.organization_id,
      'invoiceId', ordered_records.invoice_id,
      'invoiceNumber', ordered_records.invoice_number,
      'recordType', ordered_records.record_type,
      'sequenceNumber', ordered_records.sequence_number,
      'previousHash', fiscal_record_chain.hash,
      'invoiceStatus', ordered_records.invoice_status,
      'issueDate', ordered_records.issue_date,
      'dueDate', ordered_records.due_date,
      'currency', ordered_records.currency,
      'subtotalCents', ordered_records.subtotal_cents,
      'discountCents', ordered_records.discount_cents,
      'taxCents', ordered_records.tax_cents,
      'withholdingType', ordered_records.withholding_type,
      'withholdingRate', ordered_records.withholding_rate,
      'withholdingAmountCents', ordered_records.withholding_amount_cents,
      'totalCents', ordered_records.total_cents,
      'snapshot', ordered_records.snapshot
    ) AS hash_input
  ) AS hash_payload
)
UPDATE "InvoiceFiscalRecord" AS fiscal_record
SET
  "previousRecordId" = fiscal_record_chain.previous_record_id,
  "previousHash" = fiscal_record_chain.previous_hash,
  "hashInput" = fiscal_record_chain.hash_input,
  "hash" = fiscal_record_chain.hash,
  "hashVersion" = 'internal-v1'
FROM fiscal_record_chain
WHERE fiscal_record."id" = fiscal_record_chain.id;

ALTER TABLE "InvoiceFiscalRecord"
  ALTER COLUMN "hash" SET NOT NULL,
  ALTER COLUMN "hashInput" SET NOT NULL;

DROP FUNCTION "__asienta_canonical_jsonb"(JSONB);

CREATE UNIQUE INDEX "InvoiceFiscalRecord_previousRecordId_key"
  ON "InvoiceFiscalRecord"("previousRecordId");

ALTER TABLE "InvoiceFiscalRecord"
  ADD CONSTRAINT "InvoiceFiscalRecord_previousRecordId_fkey"
  FOREIGN KEY ("previousRecordId")
  REFERENCES "InvoiceFiscalRecord"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
