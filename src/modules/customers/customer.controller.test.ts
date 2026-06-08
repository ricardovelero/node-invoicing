import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import {
  archiveCustomer,
  deleteCustomer,
  renderEditCustomer,
  restoreCustomer,
  showCustomer,
  updateCustomer,
} from "./customer.controller";

type MockRequest = Request & {
  params: Record<string, string>;
  body: Record<string, unknown>;
  path: string;
  auth: NonNullable<Request["auth"]>;
  flash: Request["flash"];
};

type MockResponse = Response & {
  statusCode?: number;
  renderedView?: string;
  renderedData?: unknown;
  redirectPath?: string;
};

const prismaMock = prisma as unknown as {
  customer: {
    delete: unknown;
    findFirst: unknown;
    updateMany: unknown;
  };
};

const originalDelete = prismaMock.customer.delete;
const originalFindFirst = prismaMock.customer.findFirst;
const originalUpdateMany = prismaMock.customer.updateMany;

afterEach(() => {
  prismaMock.customer.delete = originalDelete;
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.customer.updateMany = originalUpdateMany;
});

const createRequest = (
  customerId = "59cad9c9-16c1-4c85-83e1-6630514781a0",
  body: Record<string, unknown> = {},
) =>
  ({
    params: { customerId },
    body,
    path: `/customers/${customerId}`,
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
        paymentInstructions: null,
      },
      role: "OWNER",
    },
    flash: (() => undefined) as unknown as Request["flash"],
  }) as unknown as MockRequest;

const createResponse = () => {
  const res: {
    statusCode?: number;
    renderedView?: string;
    renderedData?: unknown;
    redirectPath?: string;
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

  return res as unknown as MockResponse;
};

test("showCustomer renders customer invoice and payment history", async () => {
  const firstPaidAt = new Date("2026-05-29T00:00:00.000Z");
  const secondPaidAt = new Date("2026-05-30T00:00:00.000Z");
  const customer = {
    id: "customer_1",
    name: "Ada Co",
    invoices: [
      {
        id: "invoice_1",
        number: "INV-2026-0001",
        status: "SENT",
        dueDate: new Date("2026-06-29T00:00:00.000Z"),
        totalCents: 10000,
        currency: "EUR",
        payments: [{ id: "payment_1", paidAt: firstPaidAt, amountCents: 10000 }],
      },
      {
        id: "invoice_2",
        number: "INV-2026-0002",
        status: "PAID",
        dueDate: new Date("2026-06-30T00:00:00.000Z"),
        totalCents: 15000,
        currency: "EUR",
        payments: [{ id: "payment_2", paidAt: secondPaidAt, amountCents: 15000 }],
      },
    ],
  };
  prismaMock.customer.findFirst = async () => customer;
  const req = createRequest();
  const res = createResponse();

  await showCustomer(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/customers/detail.njk");
  assert.deepEqual(res.renderedData, {
    title: "Ada Co",
    customer,
    invoiceRows: [
      {
        ...customer.invoices[0],
        statusBadge: {
          label: "Sent",
          variant: "info",
        },
        statusBadges: [
          {
            label: "Sent",
            variant: "info",
          },
        ],
      },
      {
        ...customer.invoices[1],
        statusBadge: {
          label: "Paid",
          variant: "success",
        },
        statusBadges: [
          {
            label: "Paid",
            variant: "success",
          },
        ],
      },
    ],
    payments: [
      {
        id: "payment_2",
        paidAt: secondPaidAt,
        amountCents: 15000,
        invoice: customer.invoices[1],
      },
      {
        id: "payment_1",
        paidAt: firstPaidAt,
        amountCents: 10000,
        invoice: customer.invoices[0],
      },
    ],
  });
});

test("showCustomer renders not found for missing customers", async () => {
  prismaMock.customer.findFirst = async () => null;
  const req = createRequest();
  const res = createResponse();

  await showCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("renderEditCustomer renders prefilled values for an organization customer", async () => {
  const customer = {
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    name: "Ada Co",
    email: "billing@ada.example",
    taxId: "TAX-123",
    addressLine1: "1 Loop St",
    city: "London",
    country: "GB",
  };
  prismaMock.customer.findFirst = async () => customer;
  const req = createRequest(customer.id);
  const res = createResponse();

  await renderEditCustomer(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/customers/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "Edit customer",
    heading: "Edit customer",
    formAction: `/customers/${customer.id}/edit`,
    submitLabel: "Save changes",
    cancelHref: `/customers/${customer.id}`,
    mode: "edit",
    values: {
      name: "Ada Co",
      email: "billing@ada.example",
      taxId: "TAX-123",
      addressLine1: "1 Loop St",
      city: "London",
      country: "GB",
    },
    errors: {},
  });
});

test("renderEditCustomer renders not found for missing customers", async () => {
  prismaMock.customer.findFirst = async () => null;
  const req = createRequest();
  const res = createResponse();

  await renderEditCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("updateCustomer renders validation errors with submitted values", async () => {
  prismaMock.customer.findFirst = async () => ({ id: "59cad9c9-16c1-4c85-83e1-6630514781a0" });
  const req = createRequest("59cad9c9-16c1-4c85-83e1-6630514781a0", {
    name: "",
    email: "not-an-email",
  });
  const res = createResponse();

  await updateCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/customers/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "Edit customer",
    heading: "Edit customer",
    formAction: "/customers/59cad9c9-16c1-4c85-83e1-6630514781a0/edit",
    submitLabel: "Save changes",
    cancelHref: "/customers/59cad9c9-16c1-4c85-83e1-6630514781a0",
    mode: "edit",
    values: req.body,
    errors: {
      name: ["Customer name is required."],
      email: ["Use a valid email address."],
    },
  });
});

test("updateCustomer renders not found for missing customers", async () => {
  prismaMock.customer.findFirst = async () => null;
  const req = createRequest("59cad9c9-16c1-4c85-83e1-6630514781a0", {
    name: "",
    email: "not-an-email",
  });
  const res = createResponse();

  await updateCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("updateCustomer updates and redirects to customer detail", async () => {
  const flashes: Array<[string, string]> = [];
  prismaMock.customer.findFirst = async () => ({ id: "59cad9c9-16c1-4c85-83e1-6630514781a0" });
  prismaMock.customer.updateMany = async () => ({ count: 1 });
  const req = createRequest("59cad9c9-16c1-4c85-83e1-6630514781a0", {
    name: "Ada Co",
    email: "billing@ada.example",
    taxId: "",
    addressLine1: "",
    city: "",
    country: "",
  });
  req.flash = ((type: string, message: string) => {
    flashes.push([type, message]);
    return 1;
  }) as Request["flash"];
  const res = createResponse();

  await updateCustomer(req, res, () => undefined);

  assert.deepEqual(flashes, [["success", "Customer updated."]]);
  assert.equal(res.redirectPath, "/customers/59cad9c9-16c1-4c85-83e1-6630514781a0");
});

test("deleteCustomer deletes customers without invoices and redirects to customers", async () => {
  const flashes: Array<[string, string]> = [];
  prismaMock.customer.findFirst = async () => ({
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    _count: { invoices: 0 },
  });
  prismaMock.customer.delete = async () => undefined;
  const req = createRequest();
  req.flash = ((type: string, message: string) => {
    flashes.push([type, message]);
    return 1;
  }) as Request["flash"];
  const res = createResponse();

  await deleteCustomer(req, res, () => undefined);

  assert.deepEqual(flashes, [["success", "Customer deleted."]]);
  assert.equal(res.redirectPath, "/customers");
});

test("deleteCustomer redirects with an error when invoices exist", async () => {
  const flashes: Array<[string, string]> = [];
  prismaMock.customer.findFirst = async () => ({
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    _count: { invoices: 1 },
  });
  const req = createRequest();
  req.flash = ((type: string, message: string) => {
    flashes.push([type, message]);
    return 1;
  }) as Request["flash"];
  const res = createResponse();

  await deleteCustomer(req, res, () => undefined);

  assert.deepEqual(flashes, [
    ["error", "Customers with invoices cannot be deleted. Archive this customer instead."],
  ]);
  assert.equal(res.redirectPath, "/customers/59cad9c9-16c1-4c85-83e1-6630514781a0");
});

test("deleteCustomer renders not found for missing customers", async () => {
  prismaMock.customer.findFirst = async () => null;
  const req = createRequest();
  const res = createResponse();

  await deleteCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("archiveCustomer archives and redirects to customer detail", async () => {
  const flashes: Array<[string, string]> = [];
  prismaMock.customer.updateMany = async () => ({ count: 1 });
  const req = createRequest();
  req.flash = ((type: string, message: string) => {
    flashes.push([type, message]);
    return 1;
  }) as Request["flash"];
  const res = createResponse();

  await archiveCustomer(req, res, () => undefined);

  assert.deepEqual(flashes, [["success", "Customer archived."]]);
  assert.equal(res.redirectPath, "/customers/59cad9c9-16c1-4c85-83e1-6630514781a0");
});

test("archiveCustomer renders not found for missing customers", async () => {
  prismaMock.customer.updateMany = async () => ({ count: 0 });
  const req = createRequest();
  const res = createResponse();

  await archiveCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("restoreCustomer restores and redirects to customer detail", async () => {
  const flashes: Array<[string, string]> = [];
  prismaMock.customer.updateMany = async () => ({ count: 1 });
  const req = createRequest();
  req.flash = ((type: string, message: string) => {
    flashes.push([type, message]);
    return 1;
  }) as Request["flash"];
  const res = createResponse();

  await restoreCustomer(req, res, () => undefined);

  assert.deepEqual(flashes, [["success", "Customer restored."]]);
  assert.equal(res.redirectPath, "/customers/59cad9c9-16c1-4c85-83e1-6630514781a0");
});

test("restoreCustomer renders not found for missing customers", async () => {
  prismaMock.customer.updateMany = async () => ({ count: 0 });
  const req = createRequest();
  const res = createResponse();

  await restoreCustomer(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});
