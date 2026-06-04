import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  archiveCatalogItemRecord,
  createCatalogItemRecord,
  getCatalogItemForEdit,
  getCatalogItems,
  restoreCatalogItemRecord,
  searchCatalogItems,
  updateCatalogItemRecord,
} from "./item.service";

const prismaMock = prisma as unknown as {
  catalogItem: {
    create: unknown;
    findFirst: unknown;
    findMany: unknown;
    updateMany: unknown;
  };
};

const originalCreate = prismaMock.catalogItem.create;
const originalFindFirst = prismaMock.catalogItem.findFirst;
const originalFindMany = prismaMock.catalogItem.findMany;
const originalUpdateMany = prismaMock.catalogItem.updateMany;

afterEach(() => {
  prismaMock.catalogItem.create = originalCreate;
  prismaMock.catalogItem.findFirst = originalFindFirst;
  prismaMock.catalogItem.findMany = originalFindMany;
  prismaMock.catalogItem.updateMany = originalUpdateMany;
});

test("getCatalogItems hides archived items by default", async () => {
  let findManyArgs: unknown;
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  await getCatalogItems("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");

  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
});

test("getCatalogItems can list archived items", async () => {
  let findManyArgs: unknown;
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  await getCatalogItems("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    archived: true,
  });

  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: { not: null },
    },
    orderBy: { createdAt: "desc" },
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
