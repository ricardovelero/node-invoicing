import type { InvoiceFiscalRecordType, Prisma } from '@prisma/client';

type InvoiceFiscalRecordSequenceRow = {
  reservedValue: bigint | number;
};

type CreateInvoiceFiscalRecordOptions = {
  invoiceId: string;
  organizationId: string;
  type: InvoiceFiscalRecordType;
  createdByUserId?: string | null;
};

export const nextInvoiceFiscalRecordSequenceNumber = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
) => {
  const rows = await tx.$queryRaw<InvoiceFiscalRecordSequenceRow[]>`
    INSERT INTO "InvoiceFiscalRecordSequence" ("organizationId", "nextValue", "createdAt", "updatedAt")
    VALUES (${organizationId}::uuid, 2, NOW(), NOW())
    ON CONFLICT ("organizationId")
    DO UPDATE SET
      "nextValue" = "InvoiceFiscalRecordSequence"."nextValue" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS "reservedValue"
  `;
  const reservedValue = rows[0]?.reservedValue;

  if (reservedValue === undefined) {
    throw new Error('Unable to reserve invoice fiscal record sequence number.');
  }

  return Number(reservedValue);
};

export const createInvoiceFiscalRecord = async (
  tx: Prisma.TransactionClient,
  options: CreateInvoiceFiscalRecordOptions,
) => {
  const sequenceNumber = await nextInvoiceFiscalRecordSequenceNumber(
    tx,
    options.organizationId,
  );

  return tx.invoiceFiscalRecord.create({
    data: {
      invoiceId: options.invoiceId,
      organizationId: options.organizationId,
      type: options.type,
      sequenceNumber,
      createdByUserId: options.createdByUserId || null,
    },
  });
};
