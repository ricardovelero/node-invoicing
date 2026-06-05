import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { amountToCents, percentToBasisPoints } from "../../lib/money";
import type { ItemForm, ItemListQuery, ItemListSort } from "./item.schema";

const itemFormData = (organizationId: string, data: ItemForm) => ({
  organizationId,
  name: data.name,
  description: data.description || null,
  unitPriceCents: amountToCents(data.unitPrice),
  currency: data.currency,
  taxRateBps: percentToBasisPoints(data.taxRate),
});

const itemListOrderBy: Record<
  ItemListSort,
  (direction: ItemListQuery["direction"]) => Prisma.CatalogItemOrderByWithRelationInput
> = {
  name: (direction) => ({ name: direction }),
  unitPriceCents: (direction) => ({ unitPriceCents: direction }),
  taxRateBps: (direction) => ({ taxRateBps: direction }),
  createdAt: (direction) => ({ createdAt: direction }),
};

const createCatalogItemListWhere = (
  organizationId: string,
  query: ItemListQuery,
): Prisma.CatalogItemWhereInput => {
  const where: Prisma.CatalogItemWhereInput = {
    organizationId,
    archivedAt: query.archived === "archived" ? { not: null } : null,
  };

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }

  return where;
};

export const getCatalogItems = async (
  organizationId: string,
  query: ItemListQuery,
) => {
  const where = createCatalogItemListWhere(organizationId, query);
  const skip = (query.page - 1) * query.limit;
  const orderBy = itemListOrderBy[query.sort](query.direction);
  const [totalCount, items] = await Promise.all([
    prisma.catalogItem.count({ where }),
    prisma.catalogItem.findMany({
      where,
      orderBy,
      skip,
      take: query.limit,
    }),
  ]);
  const totalPages = Math.max(Math.ceil(totalCount / query.limit), 1);

  return {
    items,
    totalCount,
    query,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalPages,
      hasPreviousPage: query.page > 1,
      hasNextPage: query.page < totalPages,
      previousPage: query.page > 1 ? query.page - 1 : null,
      nextPage: query.page < totalPages ? query.page + 1 : null,
    },
  };
};

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

export const searchCatalogItems = (organizationId: string, query: string) => {
  const searchTerm = query.trim();

  if (searchTerm.length < 2) {
    return Promise.resolve([]);
  }

  return prisma.catalogItem.findMany({
    where: {
      organizationId,
      archivedAt: null,
      OR: [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      unitPriceCents: true,
      currency: true,
      taxRateBps: true,
    },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    take: 8,
  });
};

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
