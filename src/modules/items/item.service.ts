import { prisma } from "../../db/prisma";
import { amountToCents, percentToBasisPoints } from "../../lib/money";
import type { ItemForm } from "./item.schema";

const itemFormData = (organizationId: string, data: ItemForm) => ({
  organizationId,
  name: data.name,
  description: data.description || null,
  unitPriceCents: amountToCents(data.unitPrice),
  currency: data.currency,
  taxRateBps: percentToBasisPoints(data.taxRate),
});

export const getCatalogItems = (
  organizationId: string,
  options?: { archived?: boolean },
) =>
  prisma.catalogItem.findMany({
    where: {
      organizationId,
      archivedAt: options?.archived ? { not: null } : null,
    },
    orderBy: { createdAt: "desc" },
  });

export const getCatalogItemForEdit = (
  organizationId: string,
  itemId: string,
) =>
  prisma.catalogItem.findFirst({
    where: {
      id: itemId,
      organizationId,
    },
  });

export const createCatalogItemRecord = (
  organizationId: string,
  data: ItemForm,
) =>
  prisma.catalogItem.create({
    data: itemFormData(organizationId, data),
  });

export const updateCatalogItemRecord = (
  organizationId: string,
  itemId: string,
  data: ItemForm,
) =>
  prisma.catalogItem.updateMany({
    where: {
      id: itemId,
      organizationId,
    },
    data: {
      name: data.name,
      description: data.description || null,
      unitPriceCents: amountToCents(data.unitPrice),
      currency: data.currency,
      taxRateBps: percentToBasisPoints(data.taxRate),
    },
  });

export const archiveCatalogItemRecord = (
  organizationId: string,
  itemId: string,
) =>
  prisma.catalogItem.updateMany({
    where: {
      id: itemId,
      organizationId,
    },
    data: {
      archivedAt: new Date(),
    },
  });

export const restoreCatalogItemRecord = (
  organizationId: string,
  itemId: string,
) =>
  prisma.catalogItem.updateMany({
    where: {
      id: itemId,
      organizationId,
    },
    data: {
      archivedAt: null,
    },
  });
