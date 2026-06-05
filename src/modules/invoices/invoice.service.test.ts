import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  calculateInvoicePaymentSummary,
  createInvoiceRecord,
  createSentInvoiceRecord,
  getAllowedInvoiceStatusActions,
  getInvoiceDetails,
  getInvoiceFormOptions,
  getInvoices,
  recordInvoicePayment,
  updateDraftInvoiceRecord,
  updateInvoiceMetadata,
  updateInvoiceStatus,
} from "./invoice.service";

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  customer: {
    findFirst: unknown;
    findMany: unknown;
  };
  organization: {
    findFirst: unknown;
  };
  invoice: {
    count: unknown;
    create: unknown;
    findFirst: unknown;
    findMany: unknown;
    update: unknown;
  };
  invoiceLine: {
    deleteMany: unknown;
  };
  invoiceSnapshot: {
    create: unknown;
    update: unknown;
  };
  payment: {
    aggregate: unknown;
    create: unknown;
  };
};

type InvoiceCreateTransactionMock = {
  $queryRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<Array<{ reservedValue: bigint | number }>>;
  customer: {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  invoice: {
    create: (args: { data: unknown; include?: unknown }) => Promise<unknown>;
  };
};

type SentInvoiceCreateTransactionMock = InvoiceCreateTransactionMock & {
  organization: {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  invoiceSnapshot: {
    create: (args: unknown) => Promise<unknown>;
  };
};

type DraftUpdateTransactionMock = {
  customer: {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  invoice: {
    findFirst: (args: unknown) => Promise<unknown>;
    update: (args: { data: unknown }) => Promise<unknown>;
  };
  invoiceLine: {
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

const originalTransaction = prismaMock.$transaction;
const originalFindFirst = prismaMock.customer.findFirst;
const originalCustomerFindMany = prismaMock.customer.findMany;
const originalOrganizationFindFirst = prismaMock.organization.findFirst;
const originalInvoiceCount = prismaMock.invoice.count;
const originalCreate = prismaMock.invoice.create;
const originalInvoiceFindFirst = prismaMock.invoice.findFirst;
const originalInvoiceFindMany = prismaMock.invoice.findMany;
const originalInvoiceUpdate = prismaMock.invoice.update;
const originalInvoiceLineDeleteMany = prismaMock.invoiceLine.deleteMany;
const originalInvoiceSnapshotCreate = prismaMock.invoiceSnapshot.create;
const originalInvoiceSnapshotUpdate = prismaMock.invoiceSnapshot.update;
const originalPaymentAggregate = prismaMock.payment.aggregate;
const originalPaymentCreate = prismaMock.payment.create;

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.customer.findFirst = originalFindFirst;
  prismaMock.customer.findMany = originalCustomerFindMany;
  prismaMock.organization.findFirst = originalOrganizationFindFirst;
  prismaMock.invoice.count = originalInvoiceCount;
  prismaMock.invoice.create = originalCreate;
  prismaMock.invoice.findFirst = originalInvoiceFindFirst;
  prismaMock.invoice.findMany = originalInvoiceFindMany;
  prismaMock.invoice.update = originalInvoiceUpdate;
  prismaMock.invoiceLine.deleteMany = originalInvoiceLineDeleteMany;
  prismaMock.invoiceSnapshot.create = originalInvoiceSnapshotCreate;
  prismaMock.invoiceSnapshot.update = originalInvoiceSnapshotUpdate;
  prismaMock.payment.aggregate = originalPaymentAggregate;
  prismaMock.payment.create = originalPaymentCreate;
});

test("getInvoiceFormOptions excludes archived customers", async () => {
  let findManyArgs: unknown;
  prismaMock.customer.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const customers = await getInvoiceFormOptions("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");

  assert.deepEqual(customers, []);
  assert.deepEqual(findManyArgs, {
    where: {
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    orderBy: { name: "asc" },
  });
});

test("createInvoiceRecord creates multiple lines and sums invoice totals", async () => {
  let createdInvoiceData: unknown;
  let customerFindFirstArgs: unknown;
  let reservedNumberOrganizationId: unknown;

  prismaMock.$transaction = async (
    callback: (tx: InvoiceCreateTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async (_strings, organizationId) => {
        reservedNumberOrganizationId = organizationId;
        return [{ reservedValue: 1 }];
      },
      customer: {
        async findFirst(args) {
          customerFindFirstArgs = args;
          return { id: "customer_1" };
        },
      },
      invoice: {
        async create(args) {
          createdInvoiceData = args.data;
          return { id: "invoice_1" };
        },
      },
    });

  const issueDate = new Date("2026-05-27T00:00:00.000Z");
  const dueDate = new Date("2026-06-27T00:00:00.000Z");

  const result = await createInvoiceRecord("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    currency: "GBP",
    issueDate,
    dueDate,
    invoiceDiscountType: "percent",
    invoiceDiscountValue: 10,
    paymentInstructions: "Pay this invoice by bank transfer.",
    notes: "Pay within 14 days.",
    lines: [
      {
        description: "Consulting services",
        quantity: 2,
        unitPrice: 100,
        discountType: "amount",
        discountValue: 10,
        taxRate: 21,
      },
      {
        description: "Support",
        quantity: 1.5,
        unitPrice: 75,
        discountType: "percent",
        discountValue: 5,
        taxRate: 10,
      },
    ],
  });

  const year = new Date().getFullYear();

  assert.deepEqual(result, { ok: true, invoice: { id: "invoice_1" } });
  assert.equal(reservedNumberOrganizationId, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");
  assert.deepEqual(customerFindFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    select: { id: true },
  });
  assert.deepEqual(createdInvoiceData, {
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    number: `INV-${year}-0001`,
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    issueDate,
    dueDate,
    subtotalCents: 31250,
    discountCents: 2969,
    taxCents: 4553,
    totalCents: 31271,
    currency: "GBP",
    paymentInstructions: "Pay this invoice by bank transfer.",
    notes: "Pay within 14 days.",
    lines: {
      create: [
        {
          description: "Consulting services",
          quantity: 2,
          unitPriceCents: 10000,
          discountCents: 1000,
          invoiceDiscountCents: 1900,
          taxRateBps: 2100,
          taxCents: 3591,
          totalCents: 19000,
        },
        {
          description: "Support",
          quantity: 1.5,
          unitPriceCents: 7500,
          discountCents: 563,
          invoiceDiscountCents: 1069,
          taxRateBps: 1000,
          taxCents: 962,
          totalCents: 10687,
        },
      ],
    },
  });
});

test("createSentInvoiceRecord creates a sent invoice and captures a snapshot", async () => {
  let createdInvoiceData: unknown;
  let createdInvoiceInclude: unknown;
  let snapshotCreateArgs: unknown;
  let customerFindFirstArgs: unknown;
  let organizationFindFirstArgs: unknown;
  let reservedNumberOrganizationId: unknown;

  const issueDate = new Date("2026-05-27T00:00:00.000Z");
  const dueDate = new Date("2026-06-27T00:00:00.000Z");
  const createdInvoice = {
    id: "invoice_1",
    subtotalCents: 10000,
    discountCents: 0,
    taxCents: 2100,
    totalCents: 12100,
    paymentInstructions: "Pay this invoice by bank transfer.",
    customer: {
      name: "Ada Co",
      email: "billing@ada.example",
      taxId: null,
      addressLine1: null,
      city: null,
      country: null,
    },
    organization: {
      name: "Analytical Engines",
      legalName: "Analytical Engines Ltd",
      taxId: "VAT123",
      addressLine1: "1 Seller St",
      city: "Madrid",
      country: "ES",
    },
    snapshot: null,
  };

  prismaMock.$transaction = async (
    callback: (tx: SentInvoiceCreateTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async (_strings, organizationId) => {
        reservedNumberOrganizationId = organizationId;
        return [{ reservedValue: 3 }];
      },
      customer: {
        async findFirst(args) {
          customerFindFirstArgs = args;
          return { id: "customer_1", email: " billing@ada.example " };
        },
      },
      organization: {
        async findFirst(args) {
          organizationFindFirstArgs = args;
          return { billingEmail: "billing@example.com" };
        },
      },
      invoice: {
        async create(args) {
          createdInvoiceData = args.data;
          createdInvoiceInclude = args.include;
          return createdInvoice;
        },
      },
      invoiceSnapshot: {
        async create(args) {
          snapshotCreateArgs = args;
          return { invoiceId: "invoice_1" };
        },
      },
    });

  const result = await createSentInvoiceRecord("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    currency: "EUR",
    issueDate,
    dueDate,
    invoiceDiscountType: "amount",
    invoiceDiscountValue: 0,
    paymentInstructions: "Pay this invoice by bank transfer.",
    notes: "",
    lines: [
      {
        description: "Consulting services",
        quantity: 1,
        unitPrice: 100,
        discountType: "amount",
        discountValue: 0,
        taxRate: 21,
      },
    ],
  });

  const year = new Date().getFullYear();

  assert.deepEqual(result, {
    ok: true,
    invoice: createdInvoice,
    customerEmail: "billing@ada.example",
  });
  assert.equal(reservedNumberOrganizationId, "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab");
  assert.deepEqual(customerFindFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    select: { id: true, email: true },
  });
  assert.deepEqual(organizationFindFirstArgs, {
    where: { id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    select: { billingEmail: true },
  });
  assert.deepEqual(createdInvoiceData, {
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    number: `INV-${year}-0003`,
    status: "SENT",
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    issueDate,
    dueDate,
    subtotalCents: 10000,
    discountCents: 0,
    taxCents: 2100,
    totalCents: 12100,
    currency: "EUR",
    paymentInstructions: "Pay this invoice by bank transfer.",
    notes: null,
    lines: {
      create: [
        {
          description: "Consulting services",
          quantity: 1,
          unitPriceCents: 10000,
          discountCents: 0,
          invoiceDiscountCents: 0,
          taxRateBps: 2100,
          taxCents: 2100,
          totalCents: 10000,
        },
      ],
    },
  });
  assert.deepEqual(createdInvoiceInclude, {
    customer: {
      select: {
        name: true,
        email: true,
        taxId: true,
        addressLine1: true,
        city: true,
        country: true,
      },
    },
    organization: {
      select: {
        name: true,
        legalName: true,
        taxId: true,
        addressLine1: true,
        city: true,
        country: true,
      },
    },
    snapshot: {
      select: {
        invoiceId: true,
      },
    },
  });
  assert.deepEqual(snapshotCreateArgs, {
    data: {
      invoiceId: "invoice_1",
      customerName: "Ada Co",
      customerEmail: "billing@ada.example",
      customerTaxId: null,
      customerAddressLine1: null,
      customerCity: null,
      customerCountry: null,
      sellerName: "Analytical Engines",
      sellerLegalName: "Analytical Engines Ltd",
      sellerTaxId: "VAT123",
      sellerAddressLine1: "1 Seller St",
      sellerCity: "Madrid",
      sellerCountry: "ES",
      paymentInstructions: "Pay this invoice by bank transfer.",
      subtotalCents: 10000,
      discountCents: 0,
      taxCents: 2100,
      totalCents: 12100,
    },
  });
});

test("createSentInvoiceRecord rejects send preconditions before creating invoices", async () => {
  const form = {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    currency: "EUR" as const,
    issueDate: new Date("2026-05-27T00:00:00.000Z"),
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    invoiceDiscountType: "amount" as const,
    invoiceDiscountValue: 0,
    paymentInstructions: "",
    notes: "",
    lines: [
      {
        description: "Consulting",
        quantity: 1,
        unitPrice: 100,
        discountType: "amount" as const,
        discountValue: 0,
        taxRate: 0,
      },
    ],
  };
  const cases = [
    {
      name: "invalid customer",
      customer: null,
      organization: { billingEmail: "billing@example.com" },
      expected: { ok: false, reason: "invalidCustomer" },
      expectedOrganizationLookups: 0,
    },
    {
      name: "missing customer email",
      customer: { id: "customer_1", email: " " },
      organization: { billingEmail: "billing@example.com" },
      expected: { ok: false, reason: "missingCustomerEmail" },
      expectedOrganizationLookups: 0,
    },
    {
      name: "missing billing email",
      customer: { id: "customer_1", email: "billing@ada.example" },
      organization: { billingEmail: "" },
      expected: { ok: false, reason: "missingBillingEmail" },
      expectedOrganizationLookups: 1,
    },
  ];

  for (const testCase of cases) {
    let organizationLookups = 0;
    let invoiceNumberReservationCalls = 0;
    let invoiceCreateCalls = 0;
    let snapshotCreateCalls = 0;

    prismaMock.$transaction = async (
      callback: (tx: SentInvoiceCreateTransactionMock) => Promise<unknown>,
    ) =>
      callback({
        $queryRaw: async () => {
          invoiceNumberReservationCalls += 1;
          return [{ reservedValue: 1 }];
        },
        customer: {
          async findFirst() {
            return testCase.customer;
          },
        },
        organization: {
          async findFirst() {
            organizationLookups += 1;
            return testCase.organization;
          },
        },
        invoice: {
          async create() {
            invoiceCreateCalls += 1;
            return { id: "invoice_1" };
          },
        },
        invoiceSnapshot: {
          async create() {
            snapshotCreateCalls += 1;
            return { invoiceId: "invoice_1" };
          },
        },
      });

    const result = await createSentInvoiceRecord(
      "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      form,
    );

    assert.deepEqual(result, testCase.expected, testCase.name);
    assert.equal(organizationLookups, testCase.expectedOrganizationLookups, testCase.name);
    assert.equal(invoiceNumberReservationCalls, 0, testCase.name);
    assert.equal(invoiceCreateCalls, 0, testCase.name);
    assert.equal(snapshotCreateCalls, 0, testCase.name);
  }
});

test("createInvoiceRecord rejects archived customers", async () => {
  let invoiceCreateCalls = 0;
  let invoiceNumberReservationCalls = 0;

  prismaMock.$transaction = async (
    callback: (tx: InvoiceCreateTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => {
        invoiceNumberReservationCalls += 1;
        return [{ reservedValue: 1 }];
      },
      customer: {
        async findFirst() {
          return null;
        },
      },
      invoice: {
        async create() {
          invoiceCreateCalls += 1;
          return { id: "invoice_1" };
        },
      },
    });

  const result = await createInvoiceRecord("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    currency: "EUR",
    issueDate: new Date("2026-05-27T00:00:00.000Z"),
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    invoiceDiscountType: "percent",
    invoiceDiscountValue: 0,
    paymentInstructions: "",
    notes: "",
    lines: [
      {
        description: "Consulting services",
        quantity: 1,
        unitPrice: 100,
        discountType: "percent",
        discountValue: 0,
        taxRate: 0,
      },
    ],
  });

  assert.deepEqual(result, { ok: false, reason: "invalidCustomer" });
  assert.equal(invoiceCreateCalls, 0);
  assert.equal(invoiceNumberReservationCalls, 0);
});

test("updateDraftInvoiceRecord replaces lines and recalculates draft invoice totals", async () => {
  let invoiceFindFirstArgs: unknown;
  let customerFindFirstArgs: unknown;
  let deleteManyArgs: unknown;
  let updateData: unknown;
  const issueDate = new Date("2026-05-27T00:00:00.000Z");
  const dueDate = new Date("2026-06-27T00:00:00.000Z");

  prismaMock.$transaction = async (
    callback: (tx: DraftUpdateTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      customer: {
        async findFirst(args) {
          customerFindFirstArgs = args;
          return { id: "customer_2" };
        },
      },
      invoice: {
        async findFirst(args) {
          invoiceFindFirstArgs = args;
          return { id: "invoice_1", status: "DRAFT" };
        },
        async update(args) {
          updateData = args.data;
          return { id: "invoice_1" };
        },
      },
      invoiceLine: {
        async deleteMany(args) {
          deleteManyArgs = args;
          return { count: 1 };
        },
      },
    });

  const result = await updateDraftInvoiceRecord(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      currency: "USD",
      issueDate,
      dueDate,
      invoiceDiscountType: "percent",
      invoiceDiscountValue: 10,
      paymentInstructions: "Updated draft payment instructions.",
      notes: "Updated draft notes.",
      lines: [
        {
          description: "Updated consulting",
          quantity: 2,
          unitPrice: 100,
          discountType: "amount",
          discountValue: 10,
          taxRate: 21,
        },
      ],
    },
  );

  assert.deepEqual(result, { ok: true, invoice: { id: "invoice_1" } });
  assert.deepEqual(invoiceFindFirstArgs, {
    where: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    select: {
      id: true,
      status: true,
    },
  });
  assert.deepEqual(customerFindFirstArgs, {
    where: {
      id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      archivedAt: null,
    },
    select: { id: true },
  });
  assert.deepEqual(deleteManyArgs, {
    where: { invoiceId: "invoice_1" },
  });
  assert.deepEqual(updateData, {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    issueDate,
    dueDate,
    subtotalCents: 20000,
    discountCents: 1900,
    taxCents: 3591,
    totalCents: 20691,
    currency: "USD",
    paymentInstructions: "Updated draft payment instructions.",
    notes: "Updated draft notes.",
    lines: {
      create: [
        {
          description: "Updated consulting",
          quantity: 2,
          unitPriceCents: 10000,
          discountCents: 1000,
          invoiceDiscountCents: 1900,
          taxRateBps: 2100,
          taxCents: 3591,
          totalCents: 19000,
        },
      ],
    },
  });
});

test("updateDraftInvoiceRecord rejects missing, non-draft, and invalid customer updates", async () => {
  const form = {
    customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    currency: "EUR" as const,
    issueDate: new Date("2026-05-27T00:00:00.000Z"),
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    invoiceDiscountType: "amount" as const,
    invoiceDiscountValue: 0,
    paymentInstructions: "",
    notes: "",
    lines: [
      {
        description: "Consulting",
        quantity: 1,
        unitPrice: 100,
        discountType: "amount" as const,
        discountValue: 0,
        taxRate: 0,
      },
    ],
  };
  const cases = [
    {
      name: "missing invoice",
      invoice: null,
      customer: { id: "customer_1" },
      expected: { ok: false, reason: "notFound" },
      expectedCustomerLookups: 0,
    },
    {
      name: "non-draft invoice",
      invoice: { id: "invoice_1", status: "SENT" },
      customer: { id: "customer_1" },
      expected: { ok: false, reason: "notEditable" },
      expectedCustomerLookups: 0,
    },
    {
      name: "invalid customer",
      invoice: { id: "invoice_1", status: "DRAFT" },
      customer: null,
      expected: { ok: false, reason: "invalidCustomer" },
      expectedCustomerLookups: 1,
    },
  ];

  for (const testCase of cases) {
    let customerFindFirstCalls = 0;
    let deleteManyCalls = 0;
    let updateCalls = 0;

    prismaMock.$transaction = async (
      callback: (tx: DraftUpdateTransactionMock) => Promise<unknown>,
    ) =>
      callback({
        customer: {
          async findFirst() {
            customerFindFirstCalls += 1;
            return testCase.customer;
          },
        },
        invoice: {
          async findFirst() {
            return testCase.invoice;
          },
          async update() {
            updateCalls += 1;
            return { id: "invoice_1" };
          },
        },
        invoiceLine: {
          async deleteMany() {
            deleteManyCalls += 1;
            return { count: 1 };
          },
        },
      });

    const result = await updateDraftInvoiceRecord(
      "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      form,
    );

    assert.deepEqual(result, testCase.expected, testCase.name);
    assert.equal(customerFindFirstCalls, testCase.expectedCustomerLookups, testCase.name);
    assert.equal(deleteManyCalls, 0, testCase.name);
    assert.equal(updateCalls, 0, testCase.name);
  }
});

test("getInvoiceDetails scopes invoice lookup by organization", async () => {
  let findFirstArgs: unknown;
  prismaMock.invoice.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return { id: "invoice_1" };
  };

  const invoice = await getInvoiceDetails(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
  );

  assert.deepEqual(invoice, { id: "invoice_1" });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    include: {
      customer: true,
      snapshot: true,
      lines: {
        orderBy: { createdAt: "asc" },
      },
      payments: {
        orderBy: { paidAt: "desc" },
      },
      emailDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
});

type MetadataTransactionMock = {
  invoice: {
    findFirst: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  invoiceSnapshot: {
    update: (args: unknown) => Promise<unknown>;
  };
};

test("updateInvoiceMetadata scopes lookup and updates invoice notes only", async () => {
  let findFirstArgs: unknown;
  let invoiceUpdateArgs: unknown;
  let snapshotUpdateCalls = 0;
  prismaMock.$transaction = async (
    callback: (tx: MetadataTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst(args) {
          findFirstArgs = args;
          return { id: "invoice_1", status: "DRAFT", snapshot: null };
        },
        async update(args) {
          invoiceUpdateArgs = args;
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async update() {
          snapshotUpdateCalls += 1;
          return { invoiceId: "invoice_1" };
        },
      },
    });

  const result = await updateInvoiceMetadata(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      intent: "notes",
      notes: "Draft note.",
    },
  );

  assert.deepEqual(result, { ok: true, invoice: { id: "invoice_1" } });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    select: {
      id: true,
      status: true,
      snapshot: {
        select: {
          invoiceId: true,
        },
      },
    },
  });
  assert.deepEqual(invoiceUpdateArgs, {
    where: { id: "invoice_1" },
    data: { notes: "Draft note." },
  });
  assert.equal(snapshotUpdateCalls, 0);
});

test("updateInvoiceMetadata updates draft invoice payment instructions only", async () => {
  let invoiceUpdateArgs: unknown;
  let snapshotUpdateCalls = 0;
  prismaMock.$transaction = async (
    callback: (tx: MetadataTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return { id: "invoice_1", status: "DRAFT", snapshot: null };
        },
        async update(args) {
          invoiceUpdateArgs = args;
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async update() {
          snapshotUpdateCalls += 1;
          return { invoiceId: "invoice_1" };
        },
      },
    });

  const result = await updateInvoiceMetadata(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      intent: "paymentInstructions",
      paymentInstructions: "Draft instructions.",
    },
  );

  assert.deepEqual(result, { ok: true, invoice: { id: "invoice_1" } });
  assert.deepEqual(invoiceUpdateArgs, {
    where: { id: "invoice_1" },
    data: { paymentInstructions: "Draft instructions." },
  });
  assert.equal(snapshotUpdateCalls, 0);
});

test("updateInvoiceMetadata updates sent invoice snapshot payment instructions only", async () => {
  let invoiceUpdateArgs: unknown;
  let snapshotUpdateArgs: unknown;
  prismaMock.$transaction = async (
    callback: (tx: MetadataTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return {
            id: "invoice_1",
            status: "SENT",
            snapshot: { invoiceId: "invoice_1" },
          };
        },
        async update(args) {
          invoiceUpdateArgs = args;
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async update(args) {
          snapshotUpdateArgs = args;
          return { invoiceId: "invoice_1" };
        },
      },
    });

  const result = await updateInvoiceMetadata(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      intent: "paymentInstructions",
      paymentInstructions: "Corrected snapshot instructions.",
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(invoiceUpdateArgs, undefined);
  assert.deepEqual(snapshotUpdateArgs, {
    where: { invoiceId: "invoice_1" },
    data: { paymentInstructions: "Corrected snapshot instructions." },
  });
});

test("updateInvoiceMetadata allows note-only updates for issued invoices without snapshots", async () => {
  let invoiceUpdateArgs: unknown;
  let snapshotUpdateCalls = 0;
  prismaMock.$transaction = async (
    callback: (tx: MetadataTransactionMock) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return { id: "invoice_1", status: "SENT", snapshot: null };
        },
        async update(args) {
          invoiceUpdateArgs = args;
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async update() {
          snapshotUpdateCalls += 1;
          return { invoiceId: "invoice_1" };
        },
      },
    });

  const result = await updateInvoiceMetadata(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      intent: "notes",
      notes: "Note without snapshot.",
    },
  );

  assert.deepEqual(result, { ok: true, invoice: { id: "invoice_1" } });
  assert.deepEqual(invoiceUpdateArgs, {
    where: { id: "invoice_1" },
    data: { notes: "Note without snapshot." },
  });
  assert.equal(snapshotUpdateCalls, 0);
});

test("updateInvoiceMetadata rejects missing invoices and issued invoices without snapshots", async () => {
  const cases = [
    {
      name: "missing invoice",
      invoice: null,
      expected: { ok: false, reason: "notFound" },
    },
    {
      name: "issued invoice without snapshot",
      invoice: { id: "invoice_1", status: "SENT", snapshot: null },
      expected: { ok: false, reason: "missingSnapshot" },
    },
  ];

  for (const testCase of cases) {
    let invoiceUpdateCalls = 0;
    let snapshotUpdateCalls = 0;
    prismaMock.$transaction = async (
      callback: (tx: MetadataTransactionMock) => Promise<unknown>,
    ) =>
      callback({
        invoice: {
          async findFirst() {
            return testCase.invoice;
          },
          async update() {
            invoiceUpdateCalls += 1;
            return { id: "invoice_1" };
          },
        },
        invoiceSnapshot: {
          async update() {
            snapshotUpdateCalls += 1;
            return { invoiceId: "invoice_1" };
          },
        },
      });

    const result = await updateInvoiceMetadata(
      "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      {
        intent: "paymentInstructions",
        paymentInstructions: "Instructions.",
      },
    );

    assert.deepEqual(result, testCase.expected, testCase.name);
    assert.equal(invoiceUpdateCalls, 0, testCase.name);
    assert.equal(snapshotUpdateCalls, 0, testCase.name);
  }
});

type StatusTransactionMock = {
  invoice: {
    findFirst: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
  invoiceSnapshot: {
    create: (args: { data: unknown }) => Promise<unknown>;
  };
};

const invoiceForStatusUpdate = {
  id: "invoice_1",
  status: "DRAFT",
  subtotalCents: 10000,
  discountCents: 1000,
  taxCents: 1890,
  totalCents: 10890,
  currency: "GBP",
  paymentInstructions: "Pay this invoice by card.",
  customer: {
    name: "Ada Co",
    email: "billing@ada.example",
    taxId: "CUST-123",
    addressLine1: "1 Customer St",
    city: "London",
    country: "GB",
  },
  organization: {
    name: "Analytical Engines",
    legalName: "Analytical Engines Ltd",
    taxId: "VAT123",
    addressLine1: "1 Seller St",
    city: "Madrid",
    country: "ES",
    paymentInstructions: "Organization default instructions.",
  },
  snapshot: null,
};

const mockStatusTransaction = ({
  invoice,
  onInvoiceFindFirst,
  onInvoiceUpdate,
  onSnapshotCreate,
}: {
  invoice: unknown;
  onInvoiceFindFirst?: (args: unknown) => void;
  onInvoiceUpdate?: (args: unknown) => void;
  onSnapshotCreate?: (args: { data: unknown }) => void;
}) => {
  prismaMock.$transaction = async (callback: (tx: StatusTransactionMock) => Promise<unknown>) =>
    callback({
      invoice: {
        async findFirst(args) {
          onInvoiceFindFirst?.(args);
          return invoice;
        },
        async update(args) {
          onInvoiceUpdate?.(args);
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async create(args) {
          onSnapshotCreate?.(args);
          return { invoiceId: "invoice_1" };
        },
      },
    });
};

const invoiceStatuses: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "OVERDUE",
  "PAID",
  "VOID",
];
const statusActions = ["send", "markOverdue", "void"] as const;
const validStatusTransitions: Partial<
  Record<InvoiceStatus, Partial<Record<(typeof statusActions)[number], InvoiceStatus>>>
> = {
  DRAFT: {
    send: "SENT",
    void: "VOID",
  },
  SENT: {
    markOverdue: "OVERDUE",
    void: "VOID",
  },
  PARTIALLY_PAID: {
    markOverdue: "OVERDUE",
    void: "VOID",
  },
  OVERDUE: {
    void: "VOID",
  },
};

test("getAllowedInvoiceStatusActions returns the full status action matrix", () => {
  assert.deepEqual(
    Object.fromEntries(
      invoiceStatuses.map((status) => [status, getAllowedInvoiceStatusActions(status)]),
    ),
    {
      DRAFT: ["send", "void"],
      SENT: ["markOverdue", "void"],
      PARTIALLY_PAID: ["markOverdue", "void"],
      OVERDUE: ["void"],
      PAID: [],
      VOID: [],
    },
  );
});

test("updateInvoiceStatus applies the full status transition matrix", async () => {
  for (const status of invoiceStatuses) {
    for (const action of statusActions) {
      let updateArgs: unknown;
      let updateCalls = 0;
      let snapshotCreateCalls = 0;
      const expectedStatus = validStatusTransitions[status]?.[action];

      mockStatusTransaction({
        invoice: {
          ...invoiceForStatusUpdate,
          status,
          snapshot: null,
        },
        onInvoiceUpdate: (args) => {
          updateCalls += 1;
          updateArgs = args;
        },
        onSnapshotCreate: () => {
          snapshotCreateCalls += 1;
        },
      });

      const result = await updateInvoiceStatus(
        "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
        "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
        { action },
      );

      if (!expectedStatus) {
        assert.deepEqual(result, { ok: false, reason: "invalidTransition" }, `${status} ${action}`);
        assert.equal(updateCalls, 0, `${status} ${action}`);
        assert.equal(snapshotCreateCalls, 0, `${status} ${action}`);
        continue;
      }

      assert.deepEqual(result, { ok: true, status: expectedStatus }, `${status} ${action}`);
      assert.equal(updateCalls, 1, `${status} ${action}`);
      assert.deepEqual(
        updateArgs,
        {
          where: { id: "invoice_1" },
          data: { status: expectedStatus },
        },
        `${status} ${action}`,
      );
      assert.equal(snapshotCreateCalls, status === "DRAFT" && action === "send" ? 1 : 0);
    }
  }
});

test("updateInvoiceStatus rejects impossible status actions without updating", async () => {
  let updateCalls = 0;
  let snapshotCreateCalls = 0;

  mockStatusTransaction({
    invoice: invoiceForStatusUpdate,
    onInvoiceUpdate: () => {
      updateCalls += 1;
    },
    onSnapshotCreate: () => {
      snapshotCreateCalls += 1;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "pay" } as unknown as Parameters<typeof updateInvoiceStatus>[2],
  );

  assert.deepEqual(result, { ok: false, reason: "invalidTransition" });
  assert.equal(updateCalls, 0);
  assert.equal(snapshotCreateCalls, 0);
});

test("updateInvoiceStatus captures a snapshot and sends draft invoices in one transaction", async () => {
  let findFirstArgs: unknown;
  let updateArgs: unknown;
  let snapshotCreateArgs: unknown;

  mockStatusTransaction({
    invoice: invoiceForStatusUpdate,
    onInvoiceFindFirst: (args) => {
      findFirstArgs = args;
    },
    onInvoiceUpdate: (args) => {
      updateArgs = args;
    },
    onSnapshotCreate: (args) => {
      snapshotCreateArgs = args;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "send" },
  );

  assert.deepEqual(result, { ok: true, status: "SENT" });
  assert.deepEqual(findFirstArgs, {
    where: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    },
    select: {
      id: true,
      status: true,
      subtotalCents: true,
      discountCents: true,
      taxCents: true,
      totalCents: true,
      paymentInstructions: true,
      customer: {
        select: {
          name: true,
          email: true,
          taxId: true,
          addressLine1: true,
          city: true,
          country: true,
        },
      },
      organization: {
        select: {
          name: true,
          legalName: true,
          taxId: true,
          addressLine1: true,
          city: true,
          country: true,
        },
      },
      snapshot: {
        select: {
          invoiceId: true,
        },
      },
    },
  });
  assert.deepEqual(snapshotCreateArgs, {
    data: {
      invoiceId: "invoice_1",
      customerName: "Ada Co",
      customerEmail: "billing@ada.example",
      customerTaxId: "CUST-123",
      customerAddressLine1: "1 Customer St",
      customerCity: "London",
      customerCountry: "GB",
      sellerName: "Analytical Engines",
      sellerLegalName: "Analytical Engines Ltd",
      sellerTaxId: "VAT123",
      sellerAddressLine1: "1 Seller St",
      sellerCity: "Madrid",
      sellerCountry: "ES",
      paymentInstructions: "Pay this invoice by card.",
      subtotalCents: 10000,
      discountCents: 1000,
      taxCents: 1890,
      totalCents: 10890,
    },
  });
  assert.deepEqual(updateArgs, {
    where: { id: "invoice_1" },
    data: { status: "SENT" },
  });
});

test("updateInvoiceStatus does not duplicate an existing invoice snapshot", async () => {
  let snapshotCreateCalls = 0;
  let updateArgs: unknown;

  mockStatusTransaction({
    invoice: {
      ...invoiceForStatusUpdate,
      snapshot: { invoiceId: "invoice_1" },
    },
    onInvoiceUpdate: (args) => {
      updateArgs = args;
    },
    onSnapshotCreate: () => {
      snapshotCreateCalls += 1;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "send" },
  );

  assert.deepEqual(result, { ok: true, status: "SENT" });
  assert.equal(snapshotCreateCalls, 0);
  assert.deepEqual(updateArgs, {
    where: { id: "invoice_1" },
    data: { status: "SENT" },
  });
});

test("updateInvoiceStatus allows missing optional billing fields when sending invoices", async () => {
  let snapshotCreateArgs: unknown;

  mockStatusTransaction({
    invoice: {
      ...invoiceForStatusUpdate,
      paymentInstructions: null,
      customer: {
        name: "Ada Co",
        email: null,
        taxId: null,
        addressLine1: null,
        city: null,
        country: null,
      },
      organization: {
        name: "Analytical Engines",
        legalName: null,
        taxId: null,
        addressLine1: null,
        city: null,
        country: null,
        paymentInstructions: null,
      },
    },
    onSnapshotCreate: (args) => {
      snapshotCreateArgs = args;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "send" },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(snapshotCreateArgs, {
    data: {
      invoiceId: "invoice_1",
      customerName: "Ada Co",
      customerEmail: null,
      customerTaxId: null,
      customerAddressLine1: null,
      customerCity: null,
      customerCountry: null,
      sellerName: "Analytical Engines",
      sellerLegalName: null,
      sellerTaxId: null,
      sellerAddressLine1: null,
      sellerCity: null,
      sellerCountry: null,
      paymentInstructions: null,
      subtotalCents: 10000,
      discountCents: 1000,
      taxCents: 1890,
      totalCents: 10890,
    },
  });
});

test("updateInvoiceStatus applies non-issuing status transitions without snapshots", async () => {
  let updateArgs: unknown;
  let snapshotCreateCalls = 0;

  mockStatusTransaction({
    invoice: {
      ...invoiceForStatusUpdate,
      status: "SENT",
      snapshot: { invoiceId: "invoice_1" },
    },
    onInvoiceUpdate: (args) => {
      updateArgs = args;
    },
    onSnapshotCreate: () => {
      snapshotCreateCalls += 1;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "markOverdue" },
  );

  assert.deepEqual(result, { ok: true, status: "OVERDUE" });
  assert.equal(snapshotCreateCalls, 0);
  assert.deepEqual(updateArgs, {
    where: { id: "invoice_1" },
    data: { status: "OVERDUE" },
  });
});

test("updateInvoiceStatus rejects missing invoices", async () => {
  let updateCalls = 0;
  let snapshotCreateCalls = 0;

  mockStatusTransaction({
    invoice: null,
    onInvoiceUpdate: () => {
      updateCalls += 1;
    },
    onSnapshotCreate: () => {
      snapshotCreateCalls += 1;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "send" },
  );

  assert.deepEqual(result, { ok: false, reason: "notFound" });
  assert.equal(updateCalls, 0);
  assert.equal(snapshotCreateCalls, 0);
});

test("updateInvoiceStatus rejects invalid and terminal transitions without snapshots", async () => {
  let updateCalls = 0;
  let snapshotCreateCalls = 0;

  mockStatusTransaction({
    invoice: {
      ...invoiceForStatusUpdate,
      status: "PAID",
    },
    onInvoiceUpdate: () => {
      updateCalls += 1;
    },
    onSnapshotCreate: () => {
      snapshotCreateCalls += 1;
    },
  });

  const result = await updateInvoiceStatus(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { action: "void" },
  );

  assert.deepEqual(result, { ok: false, reason: "invalidTransition" });
  assert.equal(updateCalls, 0);
  assert.equal(snapshotCreateCalls, 0);
});

test("getInvoices applies scoped pagination and default sorting", async () => {
  let countArgs: unknown;
  let findManyArgs: unknown;

  prismaMock.invoice.count = async (args: unknown) => {
    countArgs = args;
    return 0;
  };
  prismaMock.invoice.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const result = await getInvoices("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    page: 2,
    limit: 20,
    q: "",
    status: undefined,
    sort: "createdAt",
    direction: "desc",
  });

  assert.deepEqual(result.invoices, []);
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
    where: { organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
  });
  assert.deepEqual(findManyArgs, {
    where: { organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab" },
    include: { customer: true, snapshot: true },
    orderBy: { createdAt: "desc" },
    skip: 20,
    take: 20,
  });
});

test("getInvoices composes search and status filters under the current organization", async () => {
  let countArgs: unknown;
  let findManyArgs: unknown;

  prismaMock.invoice.count = async (args: unknown) => {
    countArgs = args;
    return 25;
  };
  prismaMock.invoice.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [];
  };

  const result = await getInvoices("5a87c29e-7f69-4ee0-b1c0-1478690fe5ab", {
    page: 1,
    limit: 10,
    q: "acme",
    status: "PAID",
    sort: "dueDate",
    direction: "asc",
  });

  const expectedWhere = {
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    status: "PAID",
    OR: [
      { number: { contains: "acme", mode: "insensitive" } },
      {
        customer: {
          name: { contains: "acme", mode: "insensitive" },
        },
      },
      {
        snapshot: {
          is: {
            customerName: { contains: "acme", mode: "insensitive" },
          },
        },
      },
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
    include: { customer: true, snapshot: true },
    orderBy: { dueDate: "asc" },
    skip: 0,
    take: 10,
  });
});

test("calculateInvoicePaymentSummary handles partial, exact, overpaid, and zero totals", () => {
  const cases = [
    {
      name: "no payments",
      invoice: { totalCents: 10000, payments: [] },
      expected: { paidCents: 0, outstandingCents: 10000, isPaid: false },
    },
    {
      name: "partial payments",
      invoice: { totalCents: 10000, payments: [{ amountCents: 2500 }, { amountCents: 3000 }] },
      expected: { paidCents: 5500, outstandingCents: 4500, isPaid: false },
    },
    {
      name: "exactly paid",
      invoice: { totalCents: 10000, payments: [{ amountCents: 2500 }, { amountCents: 7500 }] },
      expected: { paidCents: 10000, outstandingCents: 0, isPaid: true },
    },
    {
      name: "overpaid",
      invoice: { totalCents: 10000, payments: [{ amountCents: 9000 }, { amountCents: 1500 }] },
      expected: { paidCents: 10500, outstandingCents: 0, isPaid: true },
    },
    {
      name: "zero total",
      invoice: { totalCents: 0, payments: [] },
      expected: { paidCents: 0, outstandingCents: 0, isPaid: true },
    },
  ];

  cases.forEach(({ name, invoice, expected }) => {
    assert.deepEqual(calculateInvoicePaymentSummary(invoice), expected, name);
  });
});

type PaymentTransactionMock = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
  payment: {
    aggregate: (args: unknown) => Promise<{ _sum: { amountCents: number | null } }>;
    create: (args: { data: unknown }) => Promise<unknown>;
  };
  invoice: {
    update: (args: unknown) => Promise<unknown>;
  };
};

const mockPaymentTransaction = ({
  invoice,
  paidCents = 0,
  onLockQuery,
  onPaymentCreate,
  onInvoiceUpdate,
}: {
  invoice: unknown;
  paidCents?: number;
  onLockQuery?: (strings: TemplateStringsArray, values: unknown[]) => void;
  onPaymentCreate?: (args: { data: unknown }) => void;
  onInvoiceUpdate?: (args: unknown) => void;
}) => {
  prismaMock.$transaction = async (callback: (tx: PaymentTransactionMock) => Promise<unknown>) =>
    callback({
      $queryRaw: async (strings, ...values) => {
        onLockQuery?.(strings, values);
        return invoice ? [invoice] : [];
      },
      payment: {
        async aggregate() {
          return { _sum: { amountCents: paidCents } };
        },
        async create(args) {
          onPaymentCreate?.(args);
          return { id: "payment_1" };
        },
      },
      invoice: {
        async update(args) {
          onInvoiceUpdate?.(args);
          return { id: "invoice_1" };
        },
      },
    });
};

test("recordInvoicePayment creates a partial payment and sets partially paid", async () => {
  let createdPaymentData: unknown;
  let updatedInvoiceData: unknown;
  const paidAt = new Date("2026-05-29T00:00:00.000Z");

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    paidCents: 2500,
    onPaymentCreate: (args) => {
      createdPaymentData = args.data;
    },
    onInvoiceUpdate: (args) => {
      updatedInvoiceData = args;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { amountCents: 3000, paidAt, reference: "BANK-123" },
  );

  assert.deepEqual(result, {
    ok: true,
    payment: { id: "payment_1" },
    status: "PARTIALLY_PAID",
    outstandingCents: 4500,
  });
  assert.deepEqual(createdPaymentData, {
    invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    amountCents: 3000,
    paidAt,
    reference: "BANK-123",
  });
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "PARTIALLY_PAID" },
  });
});

test("recordInvoicePayment marks an invoice paid when the balance is covered", async () => {
  let updatedInvoiceData: unknown;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "PARTIALLY_PAID",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    paidCents: 7000,
    onInvoiceUpdate: (args) => {
      updatedInvoiceData = args;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 3000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "PAID" },
  });
});

test("recordInvoicePayment keeps overdue invoices overdue when not fully paid", async () => {
  let updatedInvoiceData: unknown;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2000-06-27T00:00:00.000Z"),
    },
    paidCents: 0,
    onInvoiceUpdate: (args) => {
      updatedInvoiceData = args;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "OVERDUE" },
  });
});

test("recordInvoicePayment rejects overpayments without creating a payment", async () => {
  let paymentCreateCalls = 0;
  let invoiceUpdateCalls = 0;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    paidCents: 9000,
    onPaymentCreate: () => {
      paymentCreateCalls += 1;
    },
    onInvoiceUpdate: () => {
      invoiceUpdateCalls += 1;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1001,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "overpayment",
    outstandingCents: 1000,
  });
  assert.equal(paymentCreateCalls, 0);
  assert.equal(invoiceUpdateCalls, 0);
});

test("recordInvoicePayment rejects invoices whose existing payments already cover the total", async () => {
  for (const paidCents of [10000, 10500]) {
    let paymentCreateCalls = 0;
    let invoiceUpdateCalls = 0;

    mockPaymentTransaction({
      invoice: {
        id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
        status: "SENT",
        totalCents: 10000,
        dueDate: new Date("2099-06-27T00:00:00.000Z"),
      },
      paidCents,
      onPaymentCreate: () => {
        paymentCreateCalls += 1;
      },
      onInvoiceUpdate: () => {
        invoiceUpdateCalls += 1;
      },
    });

    const result = await recordInvoicePayment(
      "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
      "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      {
        amountCents: 1,
        paidAt: new Date("2026-05-29T00:00:00.000Z"),
        reference: "",
      },
    );

    assert.deepEqual(result, { ok: false, reason: "alreadyPaid" }, String(paidCents));
    assert.equal(paymentCreateCalls, 0, String(paidCents));
    assert.equal(invoiceUpdateCalls, 0, String(paidCents));
  }
});

test("recordInvoicePayment rejects invoices that cannot accept payments", async () => {
  let paymentCreateCalls = 0;

  mockPaymentTransaction({
    invoice: {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      status: "DRAFT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    onPaymentCreate: () => {
      paymentCreateCalls += 1;
    },
  });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.deepEqual(result, { ok: false, reason: "invalidStatus" });
  assert.equal(paymentCreateCalls, 0);
});

test("recordInvoicePayment rejects invoices outside the organization", async () => {
  mockPaymentTransaction({ invoice: null });

  const result = await recordInvoicePayment(
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    {
      amountCents: 1000,
      paidAt: new Date("2026-05-29T00:00:00.000Z"),
      reference: "",
    },
  );

  assert.deepEqual(result, { ok: false, reason: "notFound" });
});

test("recordInvoicePayment locks the invoice row scoped by organization", async () => {
  const organizationId = "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab";
  const invoiceId = "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c";
  let query = "";
  let queryValues: unknown[] = [];

  mockPaymentTransaction({
    invoice: {
      id: invoiceId,
      status: "SENT",
      totalCents: 10000,
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
    },
    onLockQuery: (strings, values) => {
      query = strings.join("?");
      queryValues = values;
    },
  });

  await recordInvoicePayment(organizationId, invoiceId, {
    amountCents: 1000,
    paidAt: new Date("2026-05-29T00:00:00.000Z"),
    reference: "",
  });

  assert.match(query, /FROM "Invoice"/);
  assert.match(query, /"id" = \?::uuid/);
  assert.match(query, /"organizationId" = \?::uuid/);
  assert.match(query, /FOR UPDATE/);
  assert.deepEqual(queryValues, [invoiceId, organizationId]);
});
