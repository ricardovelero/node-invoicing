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

export const getCustomerForEdit = (organizationId: string, customerId: string) =>
  prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      taxId: true,
      addressLine1: true,
      city: true,
      country: true,
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

export const updateCustomerRecord = (
  organizationId: string,
  customerId: string,
  data: CustomerForm,
) =>
  prisma.customer.updateMany({
    where: {
      id: customerId,
      organizationId,
    },
    data: {
      name: data.name,
      email: data.email || null,
      taxId: data.taxId || null,
      addressLine1: data.addressLine1 || null,
      city: data.city || null,
      country: data.country || null,
    },
  });
