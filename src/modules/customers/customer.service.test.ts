import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import { getCustomerDetails } from "./customer.service";

const prismaMock = prisma as unknown as {
  customer: {
    findFirst: unknown;
  };
};

const originalFindFirst = prismaMock.customer.findFirst;

afterEach(() => {
  prismaMock.customer.findFirst = originalFindFirst;
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
