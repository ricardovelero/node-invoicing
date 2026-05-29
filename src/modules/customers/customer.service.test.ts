import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import { getCustomerDetails, getCustomerForEdit, updateCustomerRecord } from "./customer.service";

const prismaMock = prisma as unknown as {
  customer: {
    findFirst: unknown;
    updateMany: unknown;
  };
};

const originalFindFirst = prismaMock.customer.findFirst;
const originalUpdateMany = prismaMock.customer.updateMany;

afterEach(() => {
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.customer.updateMany = originalUpdateMany;
});

test("getCustomerDetails scopes customer lookup by organization and includes invoice payments", async () => {
  let findFirstArgs: unknown;

  prismaMock.customer.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return { id: "customer_1" };
  };

  const customer = await getCustomerDetails(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(customer, { id: "customer_1" });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
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
});

test("getCustomerForEdit scopes customer lookup by organization", async () => {
  let findFirstArgs: unknown;

  prismaMock.customer.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return { id: "customer_1" };
  };

  const customer = await getCustomerForEdit(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(customer, { id: "customer_1" });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
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
});

test("updateCustomerRecord scopes updates and stores empty optional fields as null", async () => {
  let updateManyArgs: unknown;

  prismaMock.customer.updateMany = async (args: unknown) => {
    updateManyArgs = args;
    return { count: 1 };
  };

  const result = await updateCustomerRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
    {
      name: "Ada Co",
      email: "",
      taxId: "",
      addressLine1: "",
      city: "",
      country: "",
    },
  );

  assert.deepEqual(result, { count: 1 });
  assert.deepEqual(updateManyArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    data: {
      name: "Ada Co",
      email: null,
      taxId: null,
      addressLine1: null,
      city: null,
      country: null,
    },
  });
});
