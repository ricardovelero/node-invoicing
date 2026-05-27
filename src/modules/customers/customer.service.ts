import { prisma } from "../../db/prisma";
import type { CustomerForm } from "./customer.schema";

export const getCustomers = (organizationId: string) =>
  prisma.customer.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

export const createCustomerRecord = (organizationId: string, data: CustomerForm) =>
  prisma.customer.create({
    data: {
      organizationId,
      name: data.name,
      email: data.email || null,
      taxId: data.taxId || null,
      addressLine1: data.addressLine1 || null,
      city: data.city || null,
      country: data.country || null,
    },
  });
