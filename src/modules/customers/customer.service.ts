import { prisma } from "../../db/prisma";
import type { CustomerForm } from "./customer.schema";

export const getCustomers = (organizationId: string) =>
  prisma.customer.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

export const getCustomerDetails = (organizationId: string, customerId: string) =>
  prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
    include: {
      invoices: {
        orderBy: { createdAt: "desc" },
        include: {
          payments: {
            orderBy: { paidAt: "desc" },
          },
        },
      },
    },
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
