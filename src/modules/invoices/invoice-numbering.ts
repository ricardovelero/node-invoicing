import { prisma } from "../../db/prisma";

export const nextInvoiceNumber = async (organizationId: string) => {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: {
      organizationId,
      number: {
        startsWith: `INV-${year}-`,
      },
    },
  });

  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
};
