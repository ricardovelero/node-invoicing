import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { prisma } from "../../db/prisma";
import {
  archiveCustomerRecord,
  deleteCustomerRecord,
  getCustomerDetails,
  getCustomerForEdit,
  getCustomers,
  restoreCustomerRecord,
  updateCustomerRecord,
} from "./customer.service";

const prismaMock = prisma as unknown as {
  customer: {
    delete: unknown;
    findMany: unknown;
    findFirst: unknown;
    updateMany: unknown;
  };
};

const originalDelete = prismaMock.customer.delete;
const originalFindMany = prismaMock.customer.findMany;
const originalFindFirst = prismaMock.customer.findFirst;
const originalUpdateMany = prismaMock.customer.updateMany;

afterEach(() => {
  prismaMock.customer.delete = originalDelete;
  prismaMock.customer.findMany = originalFindMany;
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.customer.updateMany = originalUpdateMany;
});

test("getCustomers hides archived customers by default", async () => {
  let findManyArgs: unknown;

  prismaMock.customer.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const customers = await getCustomers("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");

  assert.deepEqual(customers, []);
  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
});

test("getCustomers can list archived customers", async () => {
  let findManyArgs: unknown;

  prismaMock.customer.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  await getCustomers("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", { archived: true });

  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
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

test("deleteCustomerRecord deletes organization customers without invoices", async () => {
  let deleteArgs: unknown;

  prismaMock.customer.findFirst = async () => ({
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    _count: { invoices: 0 },
  });
  prismaMock.customer.delete = async (args: unknown) => {
    deleteArgs = args;
  };

  const result = await deleteCustomerRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.equal(result, "deleted");
  assert.deepEqual(deleteArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    },
  });
});

test("deleteCustomerRecord refuses to delete customers with invoices", async () => {
  let deleteCalls = 0;

  prismaMock.customer.findFirst = async () => ({
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    _count: { invoices: 1 },
  });
  prismaMock.customer.delete = async () => {
    deleteCalls += 1;
  };

  const result = await deleteCustomerRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.equal(result, "hasInvoices");
  assert.equal(deleteCalls, 0);
});

test("archiveCustomerRecord sets archivedAt for an organization customer", async () => {
  let updateManyArgs: {
    where: unknown;
    data: { archivedAt: unknown };
  } | undefined;

  prismaMock.customer.updateMany = async (args: typeof updateManyArgs) => {
    updateManyArgs = args;
    return { count: 1 };
  };

  const result = await archiveCustomerRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(result, { count: 1 });
  assert.deepEqual(updateManyArgs?.where, {
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
  });
  assert.ok(updateManyArgs?.data.archivedAt instanceof Date);
});

test("restoreCustomerRecord clears archivedAt for an organization customer", async () => {
  let updateManyArgs: unknown;

  prismaMock.customer.updateMany = async (args: unknown) => {
    updateManyArgs = args;
    return { count: 1 };
  };

  const result = await restoreCustomerRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "59cad9c9-16c1-4c85-83e1-6630514781a0",
  );

  assert.deepEqual(result, { count: 1 });
  assert.deepEqual(updateManyArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    data: {
      archivedAt: null,
    },
  });
});
