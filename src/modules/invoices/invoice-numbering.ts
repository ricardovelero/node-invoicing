import { prisma } from "../../db/prisma";

export const nextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: {
      number: {
        startsWith: `INV-${year}-`,
      },
    },
  });

  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
};
