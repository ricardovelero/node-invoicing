import { prisma } from "../../db/prisma";
import type { CustomerForm } from "./customer.schema";

export const getCustomers = () =>
  prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
  });

export const createCustomerRecord = (data: CustomerForm) =>
  prisma.customer.create({
    data: {
      name: data.name,
      email: data.email || null,
      taxId: data.taxId || null,
      addressLine1: data.addressLine1 || null,
      city: data.city || null,
      country: data.country || null,
    },
  });
