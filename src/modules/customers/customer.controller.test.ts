import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { showCustomer } from "./customer.controller";

type MockRequest = Request & {
  params: Record<string, string>;
  path: string;
  auth: NonNullable<Request["auth"]>;
};

type MockResponse = Response & {
  statusCode?: number;
  renderedView?: string;
  renderedData?: unknown;
};

const prismaMock = prisma as unknown as {
  customer: {
    findFirst: unknown;
  };
};

const originalFindFirst = prismaMock.customer.findFirst;

afterEach(() => {
  prismaMock.customer.findFirst = originalFindFirst;
});

const createRequest = (customerId = "59cad9c9-16c1-4c85-83e1-6630514781a0") =>
  ({
    params: { customerId },
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
  }) as unknown as MockRequest;

const createResponse = () => {
  const res: {
    statusCode?: number;
    renderedView?: string;
    renderedData?: unknown;
    status?: (statusCode: number) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
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
        payments: [{ id: "payment_1", paidAt: firstPaidAt, amountCents: 10000 }],
      },
      {
        id: "invoice_2",
        number: "INV-2026-0002",
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
