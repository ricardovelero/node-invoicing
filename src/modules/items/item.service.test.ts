import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  archiveCatalogItemRecord,
  createCatalogItemRecord,
  deleteCatalogItemRecord,
  getCatalogItemForEdit,
  getCatalogItems,
  restoreCatalogItemRecord,
  searchCatalogItems,
  updateCatalogItemRecord,
} from "./item.service";

const prismaMock = prisma as unknown as {
  catalogItem: {
    count: unknown;
    create: unknown;
    deleteMany: unknown;
    findFirst: unknown;
    findMany: unknown;
    updateMany: unknown;
  };
};

const originalCount = prismaMock.catalogItem.count;
const originalCreate = prismaMock.catalogItem.create;
const originalDeleteMany = prismaMock.catalogItem.deleteMany;
const originalFindFirst = prismaMock.catalogItem.findFirst;
const originalFindMany = prismaMock.catalogItem.findMany;
const originalUpdateMany = prismaMock.catalogItem.updateMany;

afterEach(() => {
  prismaMock.catalogItem.count = originalCount;
  prismaMock.catalogItem.create = originalCreate;
  prismaMock.catalogItem.deleteMany = originalDeleteMany;
  prismaMock.catalogItem.findFirst = originalFindFirst;
  prismaMock.catalogItem.findMany = originalFindMany;
  prismaMock.catalogItem.updateMany = originalUpdateMany;
});

test("getCatalogItems applies scoped active pagination and default sorting", async () => {
  let countArgs: unknown;
  let findManyArgs: unknown;
  prismaMock.catalogItem.count = async (args: unknown) => {
    countArgs = args;
    return 0;
  };
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const result = await getCatalogItems("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    page: 2,
    limit: 20,
    q: "",
    archived: "active",
    sort: "createdAt",
    direction: "desc",
  });

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 20,
    totalPages: 1,
    hasPreviousPage: true,
    hasNextPage: false,
    previousPage: 1,
    nextPage: null,
  });
  assert.deepEqual(countArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
  });
  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
    skip: 20,
    take: 20,
  });
});

test("getCatalogItems composes search and archived filters under the current organization", async () => {
  let countArgs: unknown;
  let findManyArgs: unknown;
  prismaMock.catalogItem.count = async (args: unknown) => {
    countArgs = args;
    return 25;
  };
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const result = await getCatalogItems("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    page: 1,
    limit: 10,
    q: "consult",
    archived: "archived",
    sort: "name",
    direction: "asc",
  });

  const expectedWhere = {
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    archivedAt: { not: null },
    OR: [
      { name: { contains: "consult", mode: "insensitive" } },
      { description: { contains: "consult", mode: "insensitive" } },
    ],
  };

  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 10,
    totalPages: 3,
    hasPreviousPage: false,
    hasNextPage: true,
    previousPage: null,
    nextPage: 2,
  });
  assert.deepEqual(countArgs, { where: expectedWhere });
  assert.deepEqual(findManyArgs, {
    where: expectedWhere,
    orderBy: { name: "asc" },
    skip: 0,
    take: 10,
  });
});

test("getCatalogItemForEdit scopes lookup by organization", async () => {
  let findFirstArgs: unknown;
  prismaMock.catalogItem.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return { id: "item_1" };
  };

  const item = await getCatalogItemForEdit(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(item, { id: "item_1" });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
  });
});

test("searchCatalogItems returns no results for short queries without hitting the database", async () => {
  let findManyCalled = false;
  prismaMock.catalogItem.findMany = async () => {
    findManyCalled = true;
    return [];
  };

  const items = await searchCatalogItems(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    " c ",
  );

  assert.deepEqual(items, []);
  assert.equal(findManyCalled, false);
});

test("searchCatalogItems scopes active case-insensitive name and description lookup", async () => {
  let findManyArgs: unknown;
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  await searchCatalogItems(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    " consult ",
  );

  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
      OR: [
        { name: { contains: "consult", mode: "insensitive" } },
        { description: { contains: "consult", mode: "insensitive" } },
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
});

test("createCatalogItemRecord stores normalized money and tax values", async () => {
  let createArgs: unknown;
  prismaMock.catalogItem.create = async (args: unknown) => {
    createArgs = args;
    return { id: "item_1" };
  };

  await createCatalogItemRecord("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    name: "Consulting",
    description: "",
    unitPrice: 125.5,
    currency: "EUR",
    taxRate: 21,
  });

  assert.deepEqual(createArgs, {
    data: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      name: "Consulting",
      description: null,
      unitPriceCents: 12550,
      currency: "EUR",
      taxRateBps: 2100,
    },
  });
});

test("updateCatalogItemRecord scopes updates by organization", async () => {
  let updateArgs: unknown;
  prismaMock.catalogItem.updateMany = async (args: unknown) => {
    updateArgs = args;
    return { count: 1 };
  };

  await updateCatalogItemRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
    {
      name: "Support",
      description: "Retainer",
      unitPrice: 99.99,
      currency: "USD",
      taxRate: 8.25,
    },
  );

  assert.deepEqual(updateArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    data: {
      name: "Support",
      description: "Retainer",
      unitPriceCents: 9999,
      currency: "USD",
      taxRateBps: 825,
    },
  });
});

test("archiveCatalogItemRecord and restoreCatalogItemRecord are scoped", async () => {
  const updateArgs: unknown[] = [];
  prismaMock.catalogItem.updateMany = async (args: unknown) => {
    updateArgs.push(args);
    return { count: 1 };
  };

  await archiveCatalogItemRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );
  await restoreCatalogItemRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(
    (updateArgs[0] as { where: unknown }).where,
    {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
  );
  assert.ok((updateArgs[0] as { data: { archivedAt: Date } }).data.archivedAt instanceof Date);
  assert.deepEqual(updateArgs[1], {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    data: {
      archivedAt: null,
    },
  });
});

test("deleteCatalogItemRecord is scoped by organization", async () => {
  let deleteArgs: unknown;
  prismaMock.catalogItem.deleteMany = async (args: unknown) => {
    deleteArgs = args;
    return { count: 1 };
  };

  await deleteCatalogItemRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(deleteArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
  });
});
