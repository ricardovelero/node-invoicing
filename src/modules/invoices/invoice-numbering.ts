import type { Prisma } from '@prisma/client';

type InvoiceNumberSequenceRow = {
  reservedValue: bigint | number;
};

export const nextInvoiceNumber = async (
  tx: Prisma.TransactionClient,
  organizationId: string,
) => {
  const year = new Date().getFullYear();
  const rows = await tx.$queryRaw<InvoiceNumberSequenceRow[]>`
    INSERT INTO "InvoiceNumberSequence" ("organizationId", "year", "nextValue", "createdAt", "updatedAt")
    VALUES (${organizationId}::uuid, ${year}, 2, NOW(), NOW())
    ON CONFLICT ("organizationId", "year")
    DO UPDATE SET
      "nextValue" = "InvoiceNumberSequence"."nextValue" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue" - 1 AS "reservedValue"
  `;
  const reservedValue = rows[0]?.reservedValue;

  if (reservedValue === undefined) {
    throw new Error('Unable to reserve invoice number.');
  }

  return `INV-${year}-${String(Number(reservedValue)).padStart(4, '0')}`;
};
