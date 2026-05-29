import { prisma } from "../../db/prisma";
import type { CustomerForm } from "./customer.schema";

export type CustomerDeleteResult = "deleted" | "hasInvoices" | "notFound";

export const getCustomers = (organizationId: string, options?: { archived?: boolean }) =>
  prisma.customer.findMany({
    where: {
      organizationId,
      archivedAt: options?.archived ? { not: null } : null,
    },
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

export const deleteCustomerRecord = async (
  organizationId: string,
  customerId: string,
): Promise<CustomerDeleteResult> => {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
    },
    select: {
      id: true,
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });

  if (!customer) {
    return "notFound";
  }

  if (customer._count.invoices > 0) {
    return "hasInvoices";
  }

  await prisma.customer.delete({
    where: {
      id: customer.id,
    },
  });

  return "deleted";
};

export const archiveCustomerRecord = (organizationId: string, customerId: string) =>
  prisma.customer.updateMany({
    where: {
      id: customerId,
      organizationId,
    },
    data: {
      archivedAt: new Date(),
    },
  });

export const restoreCustomerRecord = (organizationId: string, customerId: string) =>
  prisma.customer.updateMany({
    where: {
      id: customerId,
      organizationId,
    },
    data: {
      archivedAt: null,
    },
  });
