import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import {
  archiveItem,
  createInlineItem,
  createItem,
  listItems,
  renderEditItem,
  renderNewItem,
  restoreItem,
  searchItems,
  updateItem,
} from "./item.controller";

type MockRequest = Request & {
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: Record<string, unknown>;
  path: string;
  auth: NonNullable<Request["auth"]>;
  flashMessages: Record<string, string[]>;
};

type MockResponse = Response & {
  jsonData?: unknown;
  statusCode?: number;
  renderedView?: string;
  renderedData?: unknown;
  redirectPath?: string;
};

const prismaMock = prisma as unknown as {
  catalogItem: {
    count: unknown;
    create: unknown;
    findFirst: unknown;
    findMany: unknown;
    updateMany: unknown;
  };
};

const originalCount = prismaMock.catalogItem.count;
const originalCreate = prismaMock.catalogItem.create;
const originalFindFirst = prismaMock.catalogItem.findFirst;
const originalFindMany = prismaMock.catalogItem.findMany;
const originalUpdateMany = prismaMock.catalogItem.updateMany;
const currencies = ["EUR", "USD", "GBP", "CAD", "AUD"];

afterEach(() => {
  prismaMock.catalogItem.count = originalCount;
  prismaMock.catalogItem.create = originalCreate;
  prismaMock.catalogItem.findFirst = originalFindFirst;
  prismaMock.catalogItem.findMany = originalFindMany;
  prismaMock.catalogItem.updateMany = originalUpdateMany;
});

const createRequest = (
  options: {
    query?: Record<string, unknown>;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
) => {
  const flashMessages: Record<string, string[]> = {};

  return ({
    query: options.query ?? {},
    params: options.params ?? {
      itemId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    },
    body: options.body ?? {},
    path: "/items/59cad9c9-16c1-4c85-83e1-6630514781a0",
    auth: {
      user: {
        id: "user_1",
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      organization: {
        id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        name: "Analytical Engines",
        legalName: null,
        taxId: null,
        addressLine1: null,
        city: null,
        country: null,
        currency: "EUR",
        locale: "en-GB",
        paymentInstructions: null,
      },
      role: "OWNER",
    },
    flashMessages,
    flash(type: string, message: string) {
      flashMessages[type] = [...(flashMessages[type] ?? []), message];
    },
  }) as unknown as MockRequest;
};

const createResponse = () => {
  const res: {
    statusCode?: number;
    renderedView?: string;
    renderedData?: unknown;
    jsonData?: unknown;
    redirectPath?: string;
    json?: (data: unknown) => MockResponse;
    status?: (statusCode: number) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
    redirect?: (path: string) => MockResponse;
  } = {};

  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res as unknown as MockResponse;
  };
  res.render = (view: string, data: unknown) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };
  res.redirect = (path: string) => {
    res.redirectPath = path;
    return res as unknown as MockResponse;
  };
  res.json = (data: unknown) => {
    res.jsonData = data;
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

test("listItems renders active catalog items", async () => {
  let findManyArgs: unknown;
  const item = {
    id: "item_1",
    name: "Consulting",
    description: null,
    unitPriceCents: 12550,
    currency: "GBP",
    taxRateBps: 2100,
    archivedAt: null,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
  };
  prismaMock.catalogItem.count = async () => 1;
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [item];
  };
  const res = createResponse();

  await listItems(createRequest(), res, () => undefined);

  assert.equal(res.renderedView, "pages/items/index.njk");
  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
    skip: 0,
    take: 20,
  });
  assert.deepEqual(
    (res.renderedData as {
      title: string;
      items: unknown[];
      showingArchived: boolean;
      filters: unknown;
      pagination: unknown;
    }),
    {
    title: "Items",
    items: [
      {
        ...item,
        taxRateLabel: "21%",
      },
    ],
    showingArchived: false,
      filters: {
        q: "",
        archived: "",
        limit: 20,
        sort: "createdAt",
        direction: "desc",
      },
      pagination: {
        page: 1,
        limit: 20,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
        previousPage: null,
        nextPage: null,
        totalCount: 1,
        pages: [
          {
            page: 1,
            href: "/items?page=1&limit=20&sort=createdAt&direction=desc",
            isCurrent: true,
          },
        ],
        previousHref: null,
        nextHref: null,
      },
      archivedOptions: [
        { value: "", label: "Active items", selected: true },
        { value: "1", label: "Archived items", selected: false },
      ],
      limitOptions: [
        { value: "10", label: "10", selected: false },
        { value: "20", label: "20", selected: true },
        { value: "50", label: "50", selected: false },
      ],
      sortLinks: (res.renderedData as { sortLinks: unknown }).sortLinks,
      activeItemsHref: "/items?page=1&limit=20&sort=createdAt&direction=desc",
      archivedItemsHref: "/items?page=1&limit=20&archived=1&sort=createdAt&direction=desc",
      hasActiveFilters: false,
      emptyMessage: "",
    },
  );
});

test("listItems renders archived catalog items", async () => {
  prismaMock.catalogItem.count = async () => 0;
  prismaMock.catalogItem.findMany = async () => [];
  const res = createResponse();

  await listItems(
    createRequest({
      query: {
        archived: "1",
        q: "consult",
        limit: "10",
        sort: "name",
        direction: "asc",
      },
    }),
    res,
    () => undefined,
  );

  const renderedData = res.renderedData as {
    title: string;
    filters: unknown;
    emptyMessage: string;
  };

  assert.deepEqual({
    title: renderedData.title,
    filters: renderedData.filters,
    emptyMessage: renderedData.emptyMessage,
  }, {
    title: "Archived items",
    filters: {
      q: "consult",
      archived: "1",
      limit: 10,
      sort: "name",
      direction: "asc",
    },
    emptyMessage: "No catalog items match these filters.",
  });
});

test("renderNewItem defaults currency to the current organization currency", () => {
  const res = createResponse();

  renderNewItem(createRequest(), res, () => undefined);

  assert.equal(res.renderedView, "pages/items/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "New item",
    heading: "New item",
    formAction: "/items",
    submitLabel: "Create item",
    cancelHref: "/items",
    values: {
      name: "",
      description: "",
      unitPrice: "0",
      currency: "EUR",
      taxRate: "0",
    },
    errors: {},
    currencies,
  });
});

test("searchItems returns formatted catalog item matches", async () => {
  let findManyArgs: unknown;
  prismaMock.catalogItem.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [
      {
        id: "item_1",
        name: "Consulting",
        description: "Strategy session",
        unitPriceCents: 12550,
        currency: "EUR",
        taxRateBps: 2100,
      },
    ];
  };
  const res = createResponse();

  await searchItems(createRequest({ query: { q: "consult" } }), res, () => undefined);

  assert.deepEqual(
    (findManyArgs as { where: { organizationId: string; archivedAt: null } }).where,
    {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
      OR: [
        { name: { contains: "consult", mode: "insensitive" } },
        { description: { contains: "consult", mode: "insensitive" } },
      ],
    },
  );
  assert.deepEqual(res.jsonData, {
    items: [
      {
        id: "item_1",
        name: "Consulting",
        description: "Strategy session",
        unitPriceCents: 12550,
        unitPrice: "125.50",
        currency: "EUR",
        taxRateBps: 2100,
        taxRate: "21",
      },
    ],
  });
});

test("searchItems returns empty matches for short queries", async () => {
  let findManyCalled = false;
  prismaMock.catalogItem.findMany = async () => {
    findManyCalled = true;
    return [];
  };
  const res = createResponse();

  await searchItems(createRequest({ query: { q: "c" } }), res, () => undefined);

  assert.equal(findManyCalled, false);
  assert.deepEqual(res.jsonData, { items: [] });
});

test("createItem renders validation errors with submitted values", async () => {
  const req = createRequest({
    body: {
      name: "",
      unitPrice: "-1",
      currency: "JPY",
      taxRate: "101",
    },
  });
  const res = createResponse();

  await createItem(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/items/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "New item",
    heading: "New item",
    formAction: "/items",
    submitLabel: "Create item",
    cancelHref: "/items",
    values: {
      name: "",
      description: "",
      unitPrice: "-1",
      currency: "JPY",
      taxRate: "101",
    },
    errors: {
      name: ["Item name is required."],
      unitPrice: ["Unit price cannot be negative."],
      currency: ["Choose a supported currency."],
      taxRate: ["Tax rate cannot exceed 100%."],
    },
    currencies,
  });
});

test("createItem creates valid catalog items and redirects", async () => {
  let createArgs: unknown;
  prismaMock.catalogItem.create = async (args: unknown) => {
    createArgs = args;
    return { id: "item_1" };
  };
  const req = createRequest({
    body: {
      name: "Consulting",
      description: "",
      unitPrice: "125.50",
      currency: "GBP",
      taxRate: "21",
    },
  });
  const res = createResponse();

  await createItem(req, res, () => undefined);

  assert.deepEqual(createArgs, {
    data: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      name: "Consulting",
      description: null,
      unitPriceCents: 12550,
      currency: "GBP",
      taxRateBps: 2100,
    },
  });
  assert.deepEqual(req.flashMessages.success, ["Item created."]);
  assert.equal(res.redirectPath, "/items");
});

test("createInlineItem creates a catalog item and returns JSON", async () => {
  let createArgs: unknown;
  prismaMock.catalogItem.create = async (args: unknown) => {
    createArgs = args;
    return {
      id: "item_1",
      name: "Strategy session",
      description: "Long-form strategy workshop",
      unitPriceCents: 22575,
      currency: "USD",
      taxRateBps: 825,
      archivedAt: null,
      createdAt: new Date("2026-06-05T00:00:00.000Z"),
      updatedAt: new Date("2026-06-05T00:00:00.000Z"),
    };
  };
  const req = createRequest({
    body: {
      name: "Strategy session",
      description: "Long-form strategy workshop",
      unitPrice: "225.75",
      currency: "USD",
      taxRate: "8.25",
    },
  });
  const res = createResponse();

  await createInlineItem(req, res, () => undefined);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(createArgs, {
    data: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      name: "Strategy session",
      description: "Long-form strategy workshop",
      unitPriceCents: 22575,
      currency: "USD",
      taxRateBps: 825,
    },
  });
  assert.deepEqual(res.jsonData, {
    item: {
      id: "item_1",
      name: "Strategy session",
      description: "Long-form strategy workshop",
      unitPriceCents: 22575,
      unitPrice: "225.75",
      currency: "USD",
      taxRateBps: 825,
      taxRate: "8.25",
    },
  });
  assert.deepEqual(req.flashMessages, {});
  assert.equal(res.redirectPath, undefined);
});

test("createInlineItem returns JSON validation errors without redirecting", async () => {
  let createCalled = false;
  prismaMock.catalogItem.create = async () => {
    createCalled = true;
    return { id: "item_1" };
  };
  const req = createRequest({
    body: {
      name: "",
      description: "Saved from an invoice line",
      unitPrice: "-1",
      currency: "JPY",
      taxRate: "101",
    },
  });
  const res = createResponse();

  await createInlineItem(req, res, () => undefined);

  assert.equal(createCalled, false);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.jsonData, {
    errors: {
      name: ["Item name is required."],
      unitPrice: ["Unit price cannot be negative."],
      currency: ["Choose a supported currency."],
      taxRate: ["Tax rate cannot exceed 100%."],
    },
  });
  assert.deepEqual(req.flashMessages, {});
  assert.equal(res.redirectPath, undefined);
});

test("renderEditItem renders existing catalog item values", async () => {
  const item = {
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    name: "Support",
    description: "Retainer",
    unitPriceCents: 9999,
    currency: "USD",
    taxRateBps: 825,
  };
  prismaMock.catalogItem.findFirst = async () => item;
  const res = createResponse();

  await renderEditItem(createRequest(), res, () => undefined);

  assert.equal(res.renderedView, "pages/items/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "Edit item",
    heading: "Edit item",
    formAction: `/items/${item.id}/edit`,
    submitLabel: "Save item",
    cancelHref: "/items",
    values: {
      name: "Support",
      description: "Retainer",
      unitPrice: "99.99",
      currency: "USD",
      taxRate: "8.25",
    },
    errors: {},
    currencies,
  });
});

test("updateItem renders not found for missing catalog items", async () => {
  prismaMock.catalogItem.findFirst = async () => null;
  const res = createResponse();

  await updateItem(createRequest(), res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("updateItem updates valid catalog items and redirects", async () => {
  prismaMock.catalogItem.findFirst = async () => ({ id: "item_1" });
  let updateArgs: unknown;
  prismaMock.catalogItem.updateMany = async (args: unknown) => {
    updateArgs = args;
    return { count: 1 };
  };
  const req = createRequest({
    body: {
      name: "Support",
      description: "Retainer",
      unitPrice: "99.99",
      currency: "USD",
      taxRate: "8.25",
    },
  });
  const res = createResponse();

  await updateItem(req, res, () => undefined);

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
  assert.deepEqual(req.flashMessages.success, ["Item updated."]);
  assert.equal(res.redirectPath, "/items");
});

test("archiveItem and restoreItem redirect after scoped mutations", async () => {
  const updateArgs: unknown[] = [];
  prismaMock.catalogItem.updateMany = async (args: unknown) => {
    updateArgs.push(args);
    return { count: 1 };
  };

  const archiveReq = createRequest();
  const archiveRes = createResponse();
  await archiveItem(archiveReq, archiveRes, () => undefined);

  const restoreReq = createRequest();
  const restoreRes = createResponse();
  await restoreItem(restoreReq, restoreRes, () => undefined);

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
  assert.deepEqual(archiveReq.flashMessages.success, ["Item archived."]);
  assert.equal(archiveRes.redirectPath, "/items");
  assert.deepEqual(restoreReq.flashMessages.success, ["Item restored."]);
  assert.equal(restoreRes.redirectPath, "/items?archived=1");
});
