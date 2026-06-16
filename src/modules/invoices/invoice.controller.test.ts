import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { createCurrencyOptions } from "../../lib/currencies";
import { createTranslator, loadTranslations, type Translate } from "../../lib/i18n";
import {
  createInvoice,
  downloadInvoicePdf,
  editInvoice,
  listInvoices,
  printInvoice,
  recordInvoicePaymentController,
  renderEditInvoice,
  renderNewInvoice,
  showInvoice,
  updateInvoiceMetadataController,
  updateInvoiceStatusController,
} from "./invoice.controller";
import {
  createEmailDeliveryStatusBadge,
  createInvoiceDisplay,
  createInvoiceLineDisplays,
  createInvoiceStatusBadge,
  createInvoiceStatusBadges,
  invoiceIndexView,
} from "./invoice.presenter";
import * as invoiceEmailService from "./invoice-email.service";
import * as invoicePdfService from "./invoice-pdf.service";

type MockRequest = Request & {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  auth: NonNullable<Request["auth"]>;
  headers: Record<string, string>;
  path: string;
  protocol: string;
  flashMessages: Record<string, string[]>;
  t: Translate;
};

type MockResponse = Response & {
  attachmentFileName?: string;
  contentType?: string;
  statusCode?: number;
  redirectedTo?: string;
  renderedView?: string;
  renderedData?: unknown;
  sentBody?: unknown;
};

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  customer: {
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
  invoiceSnapshot: {
    create: unknown;
    update: unknown;
  };
};
const invoiceEmailServiceMock = invoiceEmailService as unknown as {
  sendInvoiceEmail: typeof invoiceEmailService.sendInvoiceEmail;
};
const invoicePdfServiceMock = invoicePdfService as unknown as {
  generateInvoicePdfFromPrintUrl: typeof invoicePdfService.generateInvoicePdfFromPrintUrl;
};

const originalTransaction = prismaMock.$transaction;
const originalFindMany = prismaMock.customer.findMany;
const originalOrganizationFindFirst = prismaMock.organization.findFirst;
const originalInvoiceCount = prismaMock.invoice.count;
const originalInvoiceCreate = prismaMock.invoice.create;
const originalInvoiceFindFirst = prismaMock.invoice.findFirst;
const originalInvoiceFindMany = prismaMock.invoice.findMany;
const originalInvoiceUpdate = prismaMock.invoice.update;
const originalInvoiceSnapshotCreate = prismaMock.invoiceSnapshot.create;
const originalInvoiceSnapshotUpdate = prismaMock.invoiceSnapshot.update;
const originalSendInvoiceEmail = invoiceEmailServiceMock.sendInvoiceEmail;
const originalGenerateInvoicePdfFromPrintUrl =
  invoicePdfServiceMock.generateInvoicePdfFromPrintUrl;
const t = createTranslator("en-GB", loadTranslations(), {
  environment: "test",
});

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.customer.findMany = originalFindMany;
  prismaMock.organization.findFirst = originalOrganizationFindFirst;
  prismaMock.invoice.count = originalInvoiceCount;
  prismaMock.invoice.create = originalInvoiceCreate;
  prismaMock.invoice.findFirst = originalInvoiceFindFirst;
  prismaMock.invoice.findMany = originalInvoiceFindMany;
  prismaMock.invoice.update = originalInvoiceUpdate;
  prismaMock.invoiceSnapshot.create = originalInvoiceSnapshotCreate;
  prismaMock.invoiceSnapshot.update = originalInvoiceSnapshotUpdate;
  invoiceEmailServiceMock.sendInvoiceEmail = originalSendInvoiceEmail;
  invoicePdfServiceMock.generateInvoicePdfFromPrintUrl =
    originalGenerateInvoicePdfFromPrintUrl;
});

const createRequest = (
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  query: Record<string, unknown> = {},
) =>
  ({
    body,
    params,
    query,
    headers: { cookie: "invoice.sid=session_123" },
    path: params.invoiceId ? `/invoices/${params.invoiceId}` : "/invoices/new",
    protocol: "https",
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
        paymentInstructions: "Pay by bank transfer.",
      },
      role: "OWNER",
    },
    flashMessages: {},
    flash(type: string, message: string) {
      this.flashMessages[type] ??= [];
      this.flashMessages[type].push(message);
      return this.flashMessages[type];
    },
    t,
    get(name: string) {
      return name.toLowerCase() === "host" ? "billing.example" : undefined;
    },
  }) as MockRequest;

const createResponse = () => {
  const res: {
    statusCode?: number;
    redirectedTo?: string;
    renderedView?: string;
    renderedData?: unknown;
    attachmentFileName?: string;
    contentType?: string;
    sentBody?: unknown;
    attachment?: (fileName: string) => MockResponse;
    status?: (statusCode: number) => MockResponse;
    redirect?: (path: string) => MockResponse;
    render?: (view: string, data: unknown) => MockResponse;
    send?: (body: unknown) => MockResponse;
    type?: (contentType: string) => MockResponse;
  } = {};

  res.attachment = (fileName: string) => {
    res.attachmentFileName = fileName;
    return res as unknown as MockResponse;
  };
  res.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return res as unknown as MockResponse;
  };
  res.redirect = (path: string) => {
    res.redirectedTo = path;
    return res as unknown as MockResponse;
  };
  res.render = (view: string, data: unknown) => {
    res.renderedView = view;
    res.renderedData = data;
    return res as unknown as MockResponse;
  };
  res.send = (body: unknown) => {
    res.sentBody = body;
    return res as unknown as MockResponse;
  };
  res.type = (contentType: string) => {
    res.contentType = contentType;
    return res as unknown as MockResponse;
  };

  return res as unknown as MockResponse;
};

const statusInvoice = {
  id: "invoice_1",
  status: "DRAFT",
  subtotalCents: 10000,
  discountCents: 0,
  taxCents: 0,
  totalCents: 10000,
  currency: "EUR",
  paymentInstructions: "Draft payment instructions.",
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
  snapshot: null,
};

const printableSnapshot = {
  invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
  customerName: "Snapshot Ada Co",
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
  paymentInstructions: "Pay by bank transfer.",
  subtotalCents: 10000,
  discountCents: 1000,
  taxCents: 1890,
  totalCents: 10890,
  createdAt: new Date("2026-05-27T00:00:00.000Z"),
};

const printableInvoice = {
  id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
  number: "INV-2026-0001",
  status: "SENT",
  issueDate: new Date("2026-05-27T00:00:00.000Z"),
  dueDate: new Date("2026-06-27T00:00:00.000Z"),
  subtotalCents: 10000,
  discountCents: 1000,
  taxCents: 1890,
  totalCents: 10890,
  currency: "GBP",
  customerId: "customer_1",
  paymentInstructions: "Draft payment instructions.",
  notes: "Existing notes.",
  customer: { id: "customer_1", name: "Live Ada Co" },
  snapshot: printableSnapshot,
  lines: [
    {
      id: "line_1",
      description: "Consulting services",
      quantity: 1,
      unitPriceCents: 10000,
      discountCents: 1000,
      invoiceDiscountCents: 0,
      taxRateBps: 2100,
      taxCents: 1890,
      totalCents: 9000,
      invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      createdAt: new Date("2026-05-27T00:00:00.000Z"),
    },
  ],
  payments: [],
};

const mockStatusTransaction = ({
  invoice,
  onInvoiceUpdate,
}: {
  invoice: unknown;
  onInvoiceUpdate?: (args: unknown) => void;
}) => {
  prismaMock.$transaction = async (
    callback: (tx: {
      invoice: {
        findFirst: () => Promise<unknown>;
        update: (args: unknown) => Promise<unknown>;
      };
      invoiceSnapshot: {
        create: () => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return invoice;
        },
        async update(args) {
          onInvoiceUpdate?.(args);
          return { id: "invoice_1" };
        },
      },
      invoiceSnapshot: {
        async create() {
          return { invoiceId: "invoice_1" };
        },
      },
    });
};

const validCreateInvoiceBody = {
  customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
  currency: "EUR",
  issueDate: "2026-05-27",
  dueDate: "2026-06-27",
  invoiceDiscountType: "amount",
  invoiceDiscountValue: "0",
  paymentInstructions: "Pay by bank transfer.",
  notes: "",
  lineDescription: "Consulting services",
  quantity: "1",
  unitPrice: "100",
  lineDiscountType: "amount",
  lineDiscountValue: "0",
  taxRate: "21",
};

const mockCreateInvoiceTransaction = ({
  customer = { id: "customer_1", email: "billing@ada.example" },
  organization = { billingEmail: "billing@example.com" },
  createdInvoiceId = "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
  onInvoiceCreate,
  onSnapshotCreate,
}: {
  customer?: unknown;
  organization?: unknown;
  createdInvoiceId?: string;
  onInvoiceCreate?: (args: unknown) => void;
  onSnapshotCreate?: (args: unknown) => void;
} = {}) => {
  prismaMock.$transaction = async (
    callback: (tx: {
      $queryRaw: (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<Array<{ reservedValue: number }>>;
      customer: {
        findFirst: () => Promise<unknown>;
      };
      organization: {
        findFirst: () => Promise<unknown>;
      };
      invoice: {
        create: (args: unknown) => Promise<unknown>;
      };
      invoiceSnapshot: {
        create: (args: unknown) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => [{ reservedValue: 1 }],
      customer: {
        async findFirst() {
          return customer;
        },
      },
      organization: {
        async findFirst() {
          return organization;
        },
      },
      invoice: {
        async create(args) {
          onInvoiceCreate?.(args);
          return {
            id: createdInvoiceId,
            subtotalCents: 10000,
            discountCents: 0,
            taxCents: 2100,
            totalCents: 12100,
            paymentInstructions: "Pay by bank transfer.",
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
              legalName: null,
              taxId: null,
              addressLine1: null,
              city: null,
              country: null,
            },
            snapshot: null,
          };
        },
      },
      invoiceSnapshot: {
        async create(args) {
          onSnapshotCreate?.(args);
          return { invoiceId: createdInvoiceId };
        },
      },
    });
};

test("renderNewInvoice defaults payment instructions from organization settings and leaves notes empty", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest();
  const res = createResponse();

  await renderNewInvoice(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "New invoice",
    heading: "New invoice",
    formAction: "/invoices",
    submitLabel: "Save Draft",
    sendSubmitLabel: "Save and send to customer",
    cancelHref: "/invoices",
    customers,
    values: {
      issueDate: new Date().toISOString().slice(0, 10),
      invoiceDiscountType: "amount",
      invoiceDiscountValue: "0",
      applyWithholding: false,
      withholdingType: "IRPF",
      withholdingRateType: "custom",
      withholdingRate: "15",
      currency: "EUR",
      paymentInstructions: "Pay by bank transfer.",
      notes: "",
      lines: [
        {
          description: "",
          quantity: "1",
          unitPrice: "0",
          discountType: "amount",
          discountValue: "0",
          taxRate: "0",
        },
      ],
    },
    errors: {},
    formError: undefined,
    currencyLabel: "EUR",
    currencyOptions: createCurrencyOptions(),
    withholdingOptions: {
      isAvailable: false,
      defaultRate: "15",
      rateOptions: [],
    },
  });
});

test("renderNewInvoice preselects a valid query customer from invoice form options", async () => {
  const customerId = "59cad9c9-16c1-4c85-83e1-6630514781a0";
  const customers = [{ id: customerId, name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest({}, {}, { customerId });
  const res = createResponse();

  await renderNewInvoice(req, res, () => undefined);

  assert.equal(
    (res.renderedData as { values: { customerId?: string } }).values.customerId,
    customerId,
  );
  assert.deepEqual((res.renderedData as { errors: unknown }).errors, {});
});

test("renderNewInvoice ignores invalid or unavailable query customers", async () => {
  const customers = [
    { id: "59cad9c9-16c1-4c85-83e1-6630514781a0", name: "Ada Co" },
  ];
  prismaMock.customer.findMany = async () => customers;

  for (const customerId of [
    "not-a-uuid",
    "74db2aac-0e94-43d2-a5a5-646e405df9d0",
  ]) {
    const req = createRequest({}, {}, { customerId });
    const res = createResponse();

    await renderNewInvoice(req, res, () => undefined);

    assert.equal(
      (res.renderedData as { values: { customerId?: string } }).values.customerId,
      undefined,
    );
    assert.deepEqual((res.renderedData as { errors: unknown }).errors, {});
  }
});

test("renderNewInvoice exposes IRPF options only when organization settings allow it", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest();
  req.auth.organization.countryCode = "ES";
  req.auth.organization.legalForm = "sole_trader";
  req.auth.organization.withholdingEnabled = true;
  req.auth.organization.defaultWithholdingType = "IRPF";
  req.auth.organization.defaultWithholdingRate = { toString: () => "7" } as never;
  const res = createResponse();

  await renderNewInvoice(req, res, () => undefined);

  assert.deepEqual((res.renderedData as { withholdingOptions: unknown }).withholdingOptions, {
    isAvailable: true,
    defaultRate: "7",
    rateOptions: [
      { value: "15", label: "15%" },
      { value: "7", label: "7%" },
    ],
  });
  assert.equal((res.renderedData as { values: { applyWithholding: boolean } }).values.applyWithholding, false);
  assert.equal((res.renderedData as { values: { withholdingRate: string } }).values.withholdingRate, "7");
});

test("createInvoiceDisplay uses stored invoice withholding values", () => {
  const display = createInvoiceDisplay({
    ...printableInvoice,
    withholdingType: "IRPF",
    withholdingRate: { toString: () => "7" } as never,
    withholdingAmountCents: 700,
    snapshot: null,
    status: "DRAFT",
  } as never);

  assert.deepEqual((display as { withholding: unknown }).withholding, {
    type: "IRPF",
    rateLabel: "7",
    amountCents: 700,
  });
});

test("listInvoices renders normalized filters and paginated invoice rows", async () => {
  let findManyArgs: unknown;

  prismaMock.invoice.count = async () => 11;
  prismaMock.invoice.findMany = async (args: unknown) => {
    findManyArgs = args;
    return [
      {
        id: "invoice_1",
        number: "INV-2026-0001",
        status: "PAID",
        issueDate: new Date("2026-05-27T00:00:00.000Z"),
        dueDate: new Date("2026-06-27T00:00:00.000Z"),
        totalCents: 10000,
        currency: "EUR",
        createdAt: new Date("2026-05-27T00:00:00.000Z"),
        customer: { name: "Live Ada Co" },
        snapshot: { customerName: "Snapshot Ada Co" },
      },
    ];
  };

  const req = createRequest(
    {},
    {},
    {
      page: "2",
      limit: "10",
      q: "  acme  ",
      status: "paid",
      sort: "dueDate",
      direction: "asc",
    },
  );
  const res = createResponse();

  await listInvoices(req, res, () => undefined);

  const renderedData = res.renderedData as {
    filters: {
      q: string;
      status: string;
      limit: number;
      sort: string;
      direction: string;
    };
    invoiceRows: Array<{ customerName: string }>;
    pagination: unknown;
  };

  assert.equal(res.renderedView, "pages/invoices/index.njk");
  assert.deepEqual(renderedData.filters, {
    q: "acme",
    status: "paid",
    limit: 10,
    sort: "dueDate",
    direction: "asc",
  });
  assert.deepEqual(renderedData.pagination, {
    page: 2,
    limit: 10,
    totalPages: 2,
    hasPreviousPage: true,
    hasNextPage: false,
    previousPage: 1,
    nextPage: null,
    totalCount: 11,
    pages: [
      {
        page: 1,
        href: "/invoices?page=1&limit=10&q=acme&status=paid&sort=dueDate&direction=asc",
        isCurrent: false,
      },
      {
        page: 2,
        href: "/invoices?page=2&limit=10&q=acme&status=paid&sort=dueDate&direction=asc",
        isCurrent: true,
      },
    ],
    previousHref:
      "/invoices?page=1&limit=10&q=acme&status=paid&sort=dueDate&direction=asc",
    nextHref: null,
  });
  assert.equal(renderedData.invoiceRows[0]?.customerName, "Snapshot Ada Co");
  assert.deepEqual(findManyArgs, {
    where: {
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
    },
    include: { customer: true, snapshot: true, payments: true },
    orderBy: { dueDate: "asc" },
    skip: 10,
    take: 10,
  });
});

test("createInvoice preserves submitted notes after validation errors", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest({
    customerId: "not-a-uuid",
    issueDate: "",
    dueDate: "",
    notes: "Use these submitted notes.",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.equal(
    (res.renderedData as { values: { notes: string } }).values.notes,
    "Use these submitted notes.",
  );
  assert.equal(
    (res.renderedData as { sendSubmitLabel: string }).sendSubmitLabel,
    "Save and send to customer",
  );
});

test("createInvoice saveDraft uses the draft create path", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  let invoiceCreateArgs: unknown;
  prismaMock.customer.findMany = async () => customers;
  mockCreateInvoiceTransaction({
    onInvoiceCreate(args) {
      invoiceCreateArgs = args;
    },
  });
  invoiceEmailServiceMock.sendInvoiceEmail = async () => {
    throw new Error("email should not be sent for drafts");
  };
  const req = createRequest({
    ...validCreateInvoiceBody,
    intent: "saveDraft",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.redirectedTo, "/invoices");
  assert.deepEqual(req.flashMessages.success, ["Invoice created."]);
  assert.equal(
    (invoiceCreateArgs as { data: { status?: string } }).data.status,
    undefined,
  );
});

test("createInvoice saveAndSend creates a sent invoice, emails the customer, and flashes success", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  let invoiceCreateArgs: unknown;
  let snapshotCreateArgs: unknown;
  let sendInvoiceEmailArgs: unknown[];
  prismaMock.customer.findMany = async () => customers;
  mockCreateInvoiceTransaction({
    onInvoiceCreate(args) {
      invoiceCreateArgs = args;
    },
    onSnapshotCreate(args) {
      snapshotCreateArgs = args;
    },
  });
  invoiceEmailServiceMock.sendInvoiceEmail = (async (...args) => {
    sendInvoiceEmailArgs = args;
    return {
      ok: true,
      delivery: { id: "delivery_1" },
      publicInvoiceUrl: "https://billing.example.com/public/invoices/token",
    };
  }) as typeof invoiceEmailService.sendInvoiceEmail;
  const req = createRequest({
    ...validCreateInvoiceBody,
    intent: "saveAndSend",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
  assert.deepEqual(req.flashMessages.success, [
    "Invoice saved and sent to the customer's email address.",
  ]);
  assert.equal(
    (invoiceCreateArgs as { data: { status: string } }).data.status,
    "SENT",
  );
  assert.ok(snapshotCreateArgs);
  assert.deepEqual(sendInvoiceEmailArgs!, [
    "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    { toEmail: "billing@ada.example" },
  ]);
});

test("createInvoice saveAndSend rejects customers without email", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  let invoiceCreateCalls = 0;
  prismaMock.customer.findMany = async () => customers;
  mockCreateInvoiceTransaction({
    customer: { id: "customer_1", email: " " },
    onInvoiceCreate() {
      invoiceCreateCalls += 1;
    },
  });
  const req = createRequest({
    ...validCreateInvoiceBody,
    intent: "saveAndSend",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.equal(invoiceCreateCalls, 0);
  assert.deepEqual(
    (res.renderedData as { errors: { customerId: string[] } }).errors.customerId,
    ["Choose a customer with an email address before sending."],
  );
});

test("createInvoice saveAndSend rejects missing organization billing email", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  let invoiceCreateCalls = 0;
  prismaMock.customer.findMany = async () => customers;
  mockCreateInvoiceTransaction({
    organization: { billingEmail: "" },
    onInvoiceCreate() {
      invoiceCreateCalls += 1;
    },
  });
  const req = createRequest({
    ...validCreateInvoiceBody,
    intent: "saveAndSend",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.equal(invoiceCreateCalls, 0);
  assert.equal(
    (res.renderedData as { formError: string }).formError,
    "Please, add a billing email in your organization settings before sending invoice emails.",
  );
});

test("createInvoice saveAndSend redirects with an error flash when the provider fails", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  mockCreateInvoiceTransaction();
  invoiceEmailServiceMock.sendInvoiceEmail = async () => ({
    ok: false,
    reason: "providerFailure",
    deliveryId: "delivery_1",
    errorMessage: "Inactive recipient",
  });
  const req = createRequest({
    ...validCreateInvoiceBody,
    intent: "saveAndSend",
  });
  const res = createResponse();

  await createInvoice(req, res, () => undefined);

  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
  assert.deepEqual(req.flashMessages.error, [
    "Invoice email could not be sent: Inactive recipient",
  ]);
  assert.equal(req.flashMessages.success, undefined);
});

test("renderEditInvoice renders draft invoices with edit form values", async () => {
  const invoice = {
    ...printableInvoice,
    status: "DRAFT" as const,
    snapshot: null,
  };
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.invoice.findFirst = async () => invoice;
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest({}, { invoiceId: invoice.id });
  const res = createResponse();

  await renderEditInvoice(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.deepEqual(res.renderedData, {
    title: "Edit INV-2026-0001",
    heading: "Edit INV-2026-0001",
    formAction: `/invoices/${invoice.id}/edit`,
    submitLabel: "Save invoice",
    sendSubmitLabel: undefined,
    cancelHref: `/invoices/${invoice.id}`,
    customers,
    values: {
      customerId: "customer_1",
      issueDate: "2026-05-27",
      dueDate: "2026-06-27",
      currency: "GBP",
      paymentInstructions: "Draft payment instructions.",
      notes: "Existing notes.",
      invoiceDiscountType: "amount",
      invoiceDiscountValue: "10.00",
      applyWithholding: false,
      withholdingType: "",
      withholdingRateType: "15",
      withholdingRate: "15",
      lines: [
        {
          description: "Consulting services",
          quantity: "1",
          unitPrice: "100.00",
          discountType: "amount",
          discountValue: "10.00",
          taxRate: "21",
        },
      ],
    },
    errors: {},
    formError: undefined,
    currencyLabel: "GBP",
    currencyOptions: createCurrencyOptions(),
    withholdingOptions: {
      isAvailable: false,
      defaultRate: "15",
      rateOptions: [],
    },
  });
});

test("renderEditInvoice preserves custom withholding values", async () => {
  const invoice = {
    ...printableInvoice,
    status: "DRAFT" as const,
    snapshot: null,
    withholdingType: "IRPF",
    withholdingRate: { toString: () => "12.5" } as never,
    withholdingAmountCents: 1250,
  };
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.invoice.findFirst = async () => invoice;
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest({}, { invoiceId: invoice.id });
  req.auth.organization.countryCode = "ES";
  req.auth.organization.legalForm = "sole_trader";
  req.auth.organization.withholdingEnabled = true;
  req.auth.organization.defaultWithholdingType = "IRPF";
  req.auth.organization.defaultWithholdingRate = { toString: () => "15" } as never;
  const res = createResponse();

  await renderEditInvoice(req, res, () => undefined);

  const values = (res.renderedData as {
    values: {
      applyWithholding: boolean;
      withholdingType: string;
      withholdingRateType: string;
      withholdingRate: string;
    };
  }).values;

  assert.equal(values.applyWithholding, true);
  assert.equal(values.withholdingType, "IRPF");
  assert.equal(values.withholdingRateType, "custom");
  assert.equal(values.withholdingRate, "12.5");
});

test("renderEditInvoice redirects non-draft invoices", async () => {
  prismaMock.invoice.findFirst = async () => printableInvoice;
  const req = createRequest({}, { invoiceId: printableInvoice.id });
  const res = createResponse();

  await renderEditInvoice(req, res, () => undefined);

  assert.deepEqual(req.flashMessages.error, ["Only draft invoices can be edited."]);
  assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`);
});

test("editInvoice updates valid draft invoices and redirects to detail", async () => {
  let invoiceUpdateData: unknown;
  prismaMock.customer.findMany = async () => [];
  prismaMock.$transaction = async (
    callback: (tx: {
      customer: { findFirst: () => Promise<unknown> };
      organization: { findFirst: () => Promise<unknown> };
      invoice: {
        findFirst: () => Promise<unknown>;
        update: (args: { data: unknown }) => Promise<unknown>;
      };
      invoiceLine: { deleteMany: () => Promise<unknown> };
    }) => Promise<unknown>,
  ) =>
    callback({
      customer: {
        async findFirst() {
          return { id: "59cad9c9-16c1-4c85-83e1-6630514781a0" };
        },
      },
      organization: {
        async findFirst() {
          return {
            countryCode: null,
            legalForm: "other",
            withholdingEnabled: false,
            defaultWithholdingType: null,
            defaultWithholdingRate: null,
          };
        },
      },
      invoice: {
        async findFirst() {
          return { id: printableInvoice.id, status: "DRAFT" };
        },
        async update(args) {
          invoiceUpdateData = args.data;
          return { id: printableInvoice.id };
        },
      },
      invoiceLine: {
        async deleteMany() {
          return { count: 1 };
        },
      },
    });
  const req = createRequest(
    {
      customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
      currency: "USD",
      issueDate: "2026-05-27",
      dueDate: "2026-06-27",
      invoiceDiscountType: "amount",
      invoiceDiscountValue: "0",
      paymentInstructions: "Updated payment instructions.",
      notes: "Updated notes.",
      lineDescription: ["Updated consulting"],
      quantity: ["1"],
      unitPrice: ["100"],
      lineDiscountType: ["amount"],
      lineDiscountValue: ["0"],
      taxRate: ["0"],
    },
    { invoiceId: printableInvoice.id },
  );
  const res = createResponse();

  await editInvoice(req, res, () => undefined);

  assert.equal((invoiceUpdateData as { currency: string }).currency, "USD");
  assert.equal(
    (invoiceUpdateData as { paymentInstructions: string }).paymentInstructions,
    "Updated payment instructions.",
  );
  assert.equal((invoiceUpdateData as { notes: string }).notes, "Updated notes.");
  assert.deepEqual(req.flashMessages.success, ["Invoice updated."]);
  assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`);
});

test("editInvoice re-renders edit form metadata for validation errors", async () => {
  const customers = [{ id: "customer_1", name: "Ada Co" }];
  prismaMock.customer.findMany = async () => customers;
  const req = createRequest(
    {
      customerId: "not-a-uuid",
      issueDate: "",
      dueDate: "",
    },
    { invoiceId: printableInvoice.id },
  );
  const res = createResponse();

  await editInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/form.njk");
  assert.deepEqual(
    {
      title: (res.renderedData as { title: string }).title,
      heading: (res.renderedData as { heading: string }).heading,
      formAction: (res.renderedData as { formAction: string }).formAction,
      submitLabel: (res.renderedData as { submitLabel: string }).submitLabel,
      cancelHref: (res.renderedData as { cancelHref: string }).cancelHref,
    },
    {
      title: "Edit invoice",
      heading: "Edit invoice",
      formAction: `/invoices/${printableInvoice.id}/edit`,
      submitLabel: "Save invoice",
      cancelHref: `/invoices/${printableInvoice.id}`,
    },
  );
});

test("showInvoice renders invoice details and available actions", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "DRAFT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    currency: "EUR",
    paymentInstructions: "Draft payment instructions.",
    notes: "Internal note.",
    customer: { id: "customer_1", name: "Ada Co" },
    snapshot: null,
    lines: [],
    payments: [],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  const req = createRequest({}, { invoiceId: invoice.id });
  const res = createResponse();

  await showInvoice(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual(res.renderedData, {
    title: "INV-2026-0001",
    invoice,
    invoiceDisplay: {
      customerName: "Ada Co",
      customerHref: "/customers/customer_1",
      currency: "EUR",
      snapshot: null,
      isPrintable: false,
    },
    invoiceLineDisplays: [],
    allowedActions: ["send", "void"],
    canEditInvoice: true,
    canRecordPayment: false,
    isEffectivelyOverdue: false,
    invoiceStatusBadge: {
      label: "Draft",
      labelKey: "invoices.statuses.draft",
      variant: "neutral",
    },
    invoiceStatusBadges: [
      {
        label: "Draft",
        labelKey: "invoices.statuses.draft",
        variant: "neutral",
      },
    ],
    paymentSummary: {
      paidCents: 0,
      outstandingCents: 10000,
      isPaid: false,
    },
    paymentValues: {
      amount: "100.00",
      paidAt: today,
      reference: "",
    },
    paymentErrors: {},
    metadataValues: {
      paymentInstructions: "Draft payment instructions.",
      notes: "Internal note.",
    },
    metadataErrors: {},
    metadataEditor: null,
    emailDeliveries: [],
  });
});

test("showInvoice disables payment recording when open invoices are fully paid or overpaid", async () => {
  const cases = [
    {
      name: "fully paid",
      payments: [{ amountCents: 4000 }, { amountCents: 6000 }],
      expectedPaidCents: 10000,
    },
    {
      name: "overpaid",
      payments: [{ amountCents: 9000 }, { amountCents: 1500 }],
      expectedPaidCents: 10500,
    },
  ];

  for (const { name, payments, expectedPaidCents } of cases) {
    const invoice = {
      id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      number: "INV-2026-0001",
      status: "SENT",
      dueDate: new Date("2099-06-27T00:00:00.000Z"),
      totalCents: 10000,
      currency: "EUR",
      customer: { id: "customer_1", name: "Ada Co" },
      snapshot: null,
      lines: [],
      payments,
    };
    prismaMock.invoice.findFirst = async () => invoice;
    const req = createRequest({}, { invoiceId: invoice.id });
    const res = createResponse();

    await showInvoice(req, res, () => undefined);

    assert.equal((res.renderedData as { canRecordPayment: boolean }).canRecordPayment, false, name);
    assert.deepEqual(
      (res.renderedData as { paymentSummary: unknown }).paymentSummary,
      {
        paidCents: expectedPaidCents,
        outstandingCents: 0,
        isPaid: true,
      },
      name,
    );
    assert.equal(
      (res.renderedData as { paymentValues: { amount: string } }).paymentValues.amount,
      "0.00",
      name,
    );
  }
});

test("createInvoiceDisplay uses live customer and currency for drafts", () => {
  const display = createInvoiceDisplay(
    {
      status: "DRAFT",
      currency: "EUR",
      customer: { id: "customer_1", name: "Live Ada Co" },
      snapshot: {
        customerName: "Snapshot Ada Co",
      },
    } as unknown as Parameters<typeof createInvoiceDisplay>[0],
  );

  assert.deepEqual(display, {
    customerName: "Live Ada Co",
    customerHref: "/customers/customer_1",
    currency: "EUR",
    snapshot: null,
    isPrintable: false,
  });
});

test("createInvoiceDisplay uses snapshot customer and currency for printable invoices", () => {
  const snapshot = {
    customerName: "Snapshot Ada Co",
  };
  const display = createInvoiceDisplay(
    {
      status: "SENT",
      currency: "GBP",
      customer: { id: "customer_1", name: "Live Ada Co" },
      snapshot,
    } as unknown as Parameters<typeof createInvoiceDisplay>[0],
  );

  assert.deepEqual(display, {
    customerName: "Snapshot Ada Co",
    customerHref: null,
    currency: "GBP",
    snapshot,
    isPrintable: true,
  });
});

test("invoice status badges use readable labels and semantic variants", () => {
  assert.deepEqual(createInvoiceStatusBadge("DRAFT"), {
    label: "Draft",
    labelKey: "invoices.statuses.draft",
    variant: "neutral",
  });
  assert.deepEqual(createInvoiceStatusBadge("SENT"), {
    label: "Sent",
    labelKey: "invoices.statuses.sent",
    variant: "info",
  });
  assert.deepEqual(createInvoiceStatusBadge("PARTIALLY_PAID"), {
    label: "Partially paid",
    labelKey: "invoices.statuses.partially_paid",
    variant: "warning",
  });
  assert.deepEqual(createInvoiceStatusBadge("PAID"), {
    label: "Paid",
    labelKey: "invoices.statuses.paid",
    variant: "success",
  });
  assert.deepEqual(createInvoiceStatusBadge("OVERDUE"), {
    label: "Overdue",
    labelKey: "invoices.statuses.overdue",
    variant: "danger",
  });
  assert.deepEqual(createInvoiceStatusBadge("VOID"), {
    label: "Void",
    labelKey: "invoices.statuses.void",
    variant: "muted",
  });
});

test("invoice status badge list keeps partial payment visible when overdue", () => {
  assert.deepEqual(
    createInvoiceStatusBadges({
      status: "OVERDUE",
      dueDate: new Date("2026-06-01T00:00:00.000Z"),
      totalCents: 10000,
      payments: [{ amountCents: 4000 }],
    }),
    [
      {
        label: "Partially paid",
        labelKey: "invoices.statuses.partially_paid",
        variant: "warning",
      },
      {
        label: "Overdue",
        labelKey: "invoices.statuses.overdue",
        variant: "danger",
      },
    ],
  );
});

test("email delivery status badges use readable labels and semantic variants", () => {
  assert.deepEqual(createEmailDeliveryStatusBadge("PENDING"), {
    label: "Pending",
    labelKey: "invoices.emailStatuses.pending",
    variant: "warning",
  });
  assert.deepEqual(createEmailDeliveryStatusBadge("SENT"), {
    label: "Sent",
    labelKey: "invoices.emailStatuses.sent",
    variant: "info",
  });
  assert.deepEqual(createEmailDeliveryStatusBadge("DELIVERED"), {
    label: "Delivered",
    labelKey: "invoices.emailStatuses.delivered",
    variant: "success",
  });
  assert.deepEqual(createEmailDeliveryStatusBadge("FAILED"), {
    label: "Failed",
    labelKey: "invoices.emailStatuses.failed",
    variant: "danger",
  });
  assert.deepEqual(createEmailDeliveryStatusBadge("BOUNCED"), {
    label: "Bounced",
    labelKey: "invoices.emailStatuses.bounced",
    variant: "danger",
  });
  assert.deepEqual(createEmailDeliveryStatusBadge("SPAM_COMPLAINT"), {
    label: "Spam complaint",
    labelKey: "invoices.emailStatuses.spamComplaint",
    variant: "danger",
  });
});

test("invoiceIndexView prepares customer names and status badges", () => {
  const rows = invoiceIndexView({
    invoices: [
      {
        id: "invoice_1",
        number: "INV-2026-0001",
        status: "DRAFT",
        issueDate: new Date("2026-05-27T00:00:00.000Z"),
        dueDate: new Date("2026-06-27T00:00:00.000Z"),
        totalCents: 10000,
        currency: "EUR",
        createdAt: new Date("2026-05-27T00:00:00.000Z"),
        customer: { name: "Live Ada Co" },
        snapshot: { customerName: "Snapshot Ada Co" },
      },
      {
        id: "invoice_2",
        number: "INV-2026-0002",
        status: "SENT",
        issueDate: new Date("2026-05-28T00:00:00.000Z"),
        dueDate: new Date("2026-06-28T00:00:00.000Z"),
        totalCents: 20000,
        currency: "EUR",
        createdAt: new Date("2026-05-28T00:00:00.000Z"),
        customer: { name: "Live Byron Co" },
        snapshot: { customerName: "Snapshot Byron Co" },
      },
    ],
    totalCount: 22,
    query: {
      page: 2,
      limit: 20,
      q: "ada",
      status: "SENT",
      sort: "createdAt",
      direction: "desc",
    },
    pagination: {
      page: 2,
      limit: 20,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
      previousPage: 1,
      nextPage: null,
    },
  } as Parameters<typeof invoiceIndexView>[0]);

  assert.equal(rows.title, "Invoices");
  assert.deepEqual(rows.filters, {
    q: "ada",
    status: "sent",
    limit: 20,
    sort: "createdAt",
    direction: "desc",
  });
  assert.equal(rows.invoiceRows[0]?.customerName, "Live Ada Co");
  assert.deepEqual(rows.invoiceRows[0]?.statusBadge, {
    label: "Draft",
    labelKey: "invoices.statuses.draft",
    variant: "neutral",
  });
  assert.deepEqual(rows.invoiceRows[0]?.statusBadges, [
    {
      label: "Draft",
      labelKey: "invoices.statuses.draft",
      variant: "neutral",
    },
  ]);
  assert.equal(rows.invoiceRows[1]?.customerName, "Snapshot Byron Co");
  assert.deepEqual(rows.invoiceRows[1]?.statusBadge, {
    label: "Sent",
    labelKey: "invoices.statuses.sent",
    variant: "info",
  });
  assert.equal(rows.statusOptions.find((option) => option.value === "sent")?.selected, true);
  assert.equal(
    rows.sortLinks.createdAt.href,
    "/invoices?page=1&limit=20&q=ada&status=sent&sort=createdAt&direction=asc",
  );
  assert.equal(
    rows.pagination.previousHref,
    "/invoices?page=1&limit=20&q=ada&status=sent&sort=createdAt&direction=desc",
  );
  assert.equal(rows.emptyMessage, "");
});

test("printInvoice renders issued invoices with snapshot data", async () => {
  prismaMock.invoice.findFirst = async () => printableInvoice;
  const req = createRequest({}, { invoiceId: printableInvoice.id });
  const res = createResponse();

  await printInvoice(req, res, () => undefined);

  assert.equal(res.renderedView, "pages/invoices/print.njk");
  assert.deepEqual(res.renderedData, {
    title: "Print INV-2026-0001",
    invoice: printableInvoice,
    invoiceDisplay: {
      customerName: "Snapshot Ada Co",
      customerHref: null,
      currency: "GBP",
      snapshot: printableSnapshot,
      isPrintable: true,
    },
    invoiceLineDisplays: createInvoiceLineDisplays(printableInvoice.lines),
    snapshot: printableSnapshot,
    paymentSummary: {
      paidCents: 0,
      outstandingCents: 10890,
      isPaid: false,
    },
  });
});

test("downloadInvoicePdf renders the existing print URL with Playwright and returns an attachment", async () => {
  const pdf = Buffer.from("%PDF-1.4");
  let pdfRequest:
    | Parameters<typeof invoicePdfService.generateInvoicePdfFromPrintUrl>[0]
    | undefined;

  prismaMock.invoice.findFirst = async () => printableInvoice;
  invoicePdfServiceMock.generateInvoicePdfFromPrintUrl = async (request) => {
    pdfRequest = request;
    return pdf;
  };
  const req = createRequest({}, { invoiceId: printableInvoice.id });
  const res = createResponse();

  await downloadInvoicePdf(req, res, () => undefined);

  assert.deepEqual(pdfRequest, {
    cookieHeader: "invoice.sid=session_123",
    printUrl: `https://billing.example/invoices/${printableInvoice.id}/print`,
  });
  assert.equal(res.contentType, "application/pdf");
  assert.equal(res.attachmentFileName, "INV-2026-0001.pdf");
  assert.equal(res.sentBody, pdf);
});

test("downloadInvoicePdf redirects draft invoices and issued invoices without snapshots", async () => {
  const cases = [
    {
      name: "draft invoice",
      invoice: {
        ...printableInvoice,
        status: "DRAFT" as const,
        snapshot: printableSnapshot,
      },
    },
    {
      name: "issued invoice without snapshot",
      invoice: {
        ...printableInvoice,
        snapshot: null,
      },
    },
  ];

  for (const { name, invoice } of cases) {
    prismaMock.invoice.findFirst = async () => invoice;
    invoicePdfServiceMock.generateInvoicePdfFromPrintUrl = async () => {
      throw new Error("PDF generation should not run");
    };
    const req = createRequest({}, { invoiceId: printableInvoice.id });
    const res = createResponse();

    await downloadInvoicePdf(req, res, () => undefined);

    assert.deepEqual(
      req.flashMessages.error,
      ["Mark the invoice sent before downloading a PDF."],
      name,
    );
    assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`, name);
  }
});

test("downloadInvoicePdf renders not found for missing invoices", async () => {
  prismaMock.invoice.findFirst = async () => null;
  invoicePdfServiceMock.generateInvoicePdfFromPrintUrl = async () => {
    throw new Error("PDF generation should not run");
  };
  const req = createRequest({}, { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" });
  const res = createResponse();

  await downloadInvoicePdf(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("createInvoiceLineDisplays adds line tax labels and display totals", () => {
  assert.deepEqual(
    createInvoiceLineDisplays([
      {
        description: "Consulting services",
        quantity: 1,
        unitPriceCents: 10000,
        discountCents: 1000,
        invoiceDiscountCents: 0,
        taxRateBps: 2100,
        taxCents: 1890,
        totalCents: 9000,
      },
      {
        description: "Hosting",
        quantity: 2,
        unitPriceCents: 5000,
        discountCents: 0,
        invoiceDiscountCents: 0,
        taxRateBps: 825,
        taxCents: 825,
        totalCents: 10000,
      },
    ]),
    [
      {
        description: "Consulting services",
        quantity: 1,
        unitPriceCents: 10000,
        discountCents: 1000,
        invoiceDiscountCents: 0,
        taxRateBps: 2100,
        taxCents: 1890,
        totalCents: 9000,
        netCents: 9000,
        taxRateLabel: "21%",
        displayTotalCents: 10890,
      },
      {
        description: "Hosting",
        quantity: 2,
        unitPriceCents: 5000,
        discountCents: 0,
        invoiceDiscountCents: 0,
        taxRateBps: 825,
        taxCents: 825,
        totalCents: 10000,
        netCents: 10000,
        taxRateLabel: "8.25%",
        displayTotalCents: 10825,
      },
    ],
  );
});

test("printInvoice redirects draft invoices and issued invoices without snapshots", async () => {
  const cases = [
    {
      name: "draft invoice",
      invoice: {
        ...printableInvoice,
        status: "DRAFT" as const,
        snapshot: printableSnapshot,
      },
    },
    {
      name: "issued invoice without snapshot",
      invoice: {
        ...printableInvoice,
        snapshot: null,
      },
    },
  ];

  for (const { name, invoice } of cases) {
    prismaMock.invoice.findFirst = async () => invoice;
    const req = createRequest({}, { invoiceId: printableInvoice.id });
    const res = createResponse();

    await printInvoice(req, res, () => undefined);

    assert.deepEqual(req.flashMessages.error, ["Mark the invoice sent before printing."], name);
    assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`, name);
  }
});

test("printInvoice renders not found for missing invoices", async () => {
  prismaMock.invoice.findFirst = async () => null;
  const req = createRequest({}, { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" });
  const res = createResponse();

  await printInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("showInvoice renders not found for missing invoices", async () => {
  prismaMock.invoice.findFirst = async () => null;
  const req = createRequest({}, { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" });
  const res = createResponse();

  await showInvoice(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.equal(res.renderedView, "pages/errors/not-found.njk");
});

test("updateInvoiceMetadataController re-renders invoice detail for validation errors", async () => {
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "SENT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    currency: "EUR",
    paymentInstructions: null,
    notes: "Existing notes.",
    customer: { id: "customer_1", name: "Ada Co" },
    snapshot: printableSnapshot,
    lines: [],
    payments: [],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  const req = createRequest(
    {
      intent: "paymentInstructions",
      paymentInstructions: "x".repeat(2001),
      notes: "Use these submitted notes.",
    },
    { invoiceId: invoice.id },
  );
  const res = createResponse();

  await updateInvoiceMetadataController(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual(
    (res.renderedData as { metadataValues: unknown }).metadataValues,
    {
      paymentInstructions: "x".repeat(2001),
      notes: "Existing notes.",
    },
  );
  assert.deepEqual(
    (res.renderedData as { metadataErrors: unknown }).metadataErrors,
    {
      paymentInstructions: [
        "Payment instructions must be 2,000 characters or fewer.",
      ],
    },
  );
  assert.equal((res.renderedData as { metadataEditor: unknown }).metadataEditor, "paymentInstructions");
});

test("updateInvoiceMetadataController updates invoice notes without touching payment instructions", async () => {
  let invoiceUpdateData: unknown;
  let snapshotUpdateCalls = 0;
  prismaMock.$transaction = async (
    callback: (tx: {
      invoice: {
        findFirst: () => Promise<unknown>;
        update: (args: { data: unknown }) => Promise<unknown>;
      };
      invoiceSnapshot: {
        update: () => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return { id: printableInvoice.id, status: "DRAFT", snapshot: null };
        },
        async update(args) {
          invoiceUpdateData = args.data;
          return { id: printableInvoice.id };
        },
      },
      invoiceSnapshot: {
        async update() {
          snapshotUpdateCalls += 1;
          return { invoiceId: printableInvoice.id };
        },
      },
    });
  const req = createRequest(
    {
      intent: "notes",
      notes: "  Draft internal note.  ",
    },
    { invoiceId: printableInvoice.id },
  );
  const res = createResponse();

  await updateInvoiceMetadataController(req, res, () => undefined);

  assert.deepEqual(invoiceUpdateData, {
    notes: "Draft internal note.",
  });
  assert.equal(snapshotUpdateCalls, 0);
  assert.deepEqual(req.flashMessages.success, ["Invoice details updated."]);
  assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`);
});

test("updateInvoiceMetadataController updates draft invoice payment instructions", async () => {
  let invoiceUpdateData: unknown;
  let snapshotUpdateCalls = 0;
  prismaMock.$transaction = async (
    callback: (tx: {
      invoice: {
        findFirst: () => Promise<unknown>;
        update: (args: { data: unknown }) => Promise<unknown>;
      };
      invoiceSnapshot: {
        update: () => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return { id: printableInvoice.id, status: "DRAFT", snapshot: null };
        },
        async update(args) {
          invoiceUpdateData = args.data;
          return { id: printableInvoice.id };
        },
      },
      invoiceSnapshot: {
        async update() {
          snapshotUpdateCalls += 1;
          return { invoiceId: printableInvoice.id };
        },
      },
    });
  const req = createRequest(
    {
      intent: "paymentInstructions",
      paymentInstructions: "  Draft wire instructions.  ",
    },
    { invoiceId: printableInvoice.id },
  );
  const res = createResponse();

  await updateInvoiceMetadataController(req, res, () => undefined);

  assert.deepEqual(invoiceUpdateData, {
    paymentInstructions: "Draft wire instructions.",
  });
  assert.equal(snapshotUpdateCalls, 0);
  assert.deepEqual(req.flashMessages.success, ["Invoice details updated."]);
  assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`);
});

test("updateInvoiceMetadataController updates sent invoice snapshot payment instructions", async () => {
  let invoiceUpdateData: unknown;
  let snapshotUpdateData: unknown;
  prismaMock.$transaction = async (
    callback: (tx: {
      invoice: {
        findFirst: () => Promise<unknown>;
        update: (args: { data: unknown }) => Promise<unknown>;
      };
      invoiceSnapshot: {
        update: (args: { data: unknown }) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoice: {
        async findFirst() {
          return {
            id: printableInvoice.id,
            status: "SENT",
            snapshot: { invoiceId: printableInvoice.id },
          };
        },
        async update(args) {
          invoiceUpdateData = args.data;
          return { id: printableInvoice.id };
        },
      },
      invoiceSnapshot: {
        async update(args) {
          snapshotUpdateData = args.data;
          return { invoiceId: printableInvoice.id };
        },
      },
    });
  const req = createRequest(
    {
      intent: "paymentInstructions",
      paymentInstructions: "  Updated snapshot instructions.  ",
      notes: "  Sent internal note.  ",
    },
    { invoiceId: printableInvoice.id },
  );
  const res = createResponse();

  await updateInvoiceMetadataController(req, res, () => undefined);

  assert.equal(invoiceUpdateData, undefined);
  assert.deepEqual(snapshotUpdateData, {
    paymentInstructions: "Updated snapshot instructions.",
  });
  assert.deepEqual(req.flashMessages.success, ["Invoice details updated."]);
  assert.equal(res.redirectedTo, `/invoices/${printableInvoice.id}`);
});

test("updateInvoiceStatusController redirects with flash error for invalid transitions", async () => {
  mockStatusTransaction({
    invoice: {
      ...statusInvoice,
      status: "PAID",
    },
  });
  const req = createRequest(
    { action: "void" },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await updateInvoiceStatusController(req, res, () => undefined);

  assert.deepEqual(req.flashMessages.error, ["That status change is not allowed for this invoice."]);
  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
});

test("updateInvoiceStatusController rejects malformed status actions before calling the service", async () => {
  const cases = [
    { name: "unsupported action", body: { action: "pay" } },
    { name: "missing action", body: {} },
  ];

  for (const { name, body } of cases) {
    let transactionCalls = 0;
    prismaMock.$transaction = async () => {
      transactionCalls += 1;
      throw new Error("Status service should not be called for malformed actions.");
    };
    const req = createRequest(body, {
      invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    });
    const res = createResponse();

    await updateInvoiceStatusController(req, res, () => undefined);

    assert.deepEqual(req.flashMessages.error, ["Choose a valid invoice status action."], name);
    assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c", name);
    assert.equal(transactionCalls, 0, name);
  }
});

test("updateInvoiceStatusController redirects with flash success for valid transitions", async () => {
  let updateArgs: unknown;
  mockStatusTransaction({
    invoice: statusInvoice,
    onInvoiceUpdate: (args) => {
      updateArgs = args;
    },
  });
  const req = createRequest(
    { action: "send" },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await updateInvoiceStatusController(req, res, () => undefined);

  assert.deepEqual(updateArgs, {
    where: { id: "invoice_1" },
    data: { status: "SENT" },
  });
  assert.deepEqual(req.flashMessages.success, ["Invoice status updated."]);
  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
});

test("recordInvoicePaymentController redirects with flash success for valid payments", async () => {
  let createdPaymentData: unknown;
  let updatedInvoiceData: unknown;
  prismaMock.$transaction = async (
    callback: (tx: {
      $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
      payment: {
        aggregate: () => Promise<{ _sum: { amountCents: number } }>;
        create: (args: { data: unknown }) => Promise<unknown>;
      };
      invoice: { update: (args: unknown) => Promise<unknown> };
    }) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => [
        {
          id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
        status: "SENT" as const,
          totalCents: 10000,
          dueDate: new Date("2099-06-27T00:00:00.000Z"),
        },
      ],
      payment: {
        async aggregate() {
          return { _sum: { amountCents: 0 } };
        },
        async create(args) {
          createdPaymentData = args.data;
          return { id: "payment_1" };
        },
      },
      invoice: {
        async update(args) {
          updatedInvoiceData = args;
          return { id: "invoice_1" };
        },
      },
    });
  const req = createRequest(
    { amount: "25.50", paidAt: "2026-05-29", reference: "  BANK-123  " },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await recordInvoicePaymentController(req, res, () => undefined);

  assert.deepEqual(createdPaymentData, {
    invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    amountCents: 2550,
    paidAt: new Date("2026-05-29T00:00:00.000Z"),
    reference: "BANK-123",
  });
  assert.deepEqual(updatedInvoiceData, {
    where: { id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
    data: { status: "PARTIALLY_PAID" },
  });
  assert.deepEqual(req.flashMessages.success, ["Payment recorded."]);
  assert.equal(res.redirectedTo, "/invoices/5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c");
});

test("recordInvoicePaymentController re-renders invoice detail for invalid payment input", async () => {
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "SENT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    customer: { id: "customer_1", name: "Ada Co" },
    lines: [],
    payments: [],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  const req = createRequest(
    { amount: "", paidAt: "", reference: "" },
    { invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c" },
  );
  const res = createResponse();

  await recordInvoicePaymentController(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual((res.renderedData as { paymentErrors: unknown }).paymentErrors, {
    amount: ["Enter a payment amount."],
    paidAt: ["Enter a paid date."],
  });
});

test("recordInvoicePaymentController re-renders invoice detail for overpayments", async () => {
  const invoice = {
    id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    number: "INV-2026-0001",
    status: "SENT",
    dueDate: new Date("2026-06-27T00:00:00.000Z"),
    totalCents: 10000,
    customer: { id: "customer_1", name: "Ada Co" },
    lines: [],
    payments: [{ amountCents: 9000 }],
  };
  prismaMock.invoice.findFirst = async () => invoice;
  prismaMock.$transaction = async (
    callback: (tx: {
      $queryRaw: () => Promise<unknown[]>;
      payment: {
        aggregate: () => Promise<{ _sum: { amountCents: number } }>;
        create: () => Promise<unknown>;
      };
      invoice: { update: () => Promise<unknown> };
    }) => Promise<unknown>,
  ) =>
    callback({
      $queryRaw: async () => [
        {
          id: invoice.id,
          status: "SENT",
          totalCents: 10000,
          dueDate: new Date("2099-06-27T00:00:00.000Z"),
        },
      ],
      payment: {
        async aggregate() {
          return { _sum: { amountCents: 9000 } };
        },
        async create() {
          return { id: "payment_1" };
        },
      },
      invoice: {
        async update() {
          return { id: "invoice_1" };
        },
      },
    });
  const req = createRequest(
    { amount: "10.01", paidAt: "2026-05-29", reference: "" },
    { invoiceId: invoice.id },
  );
  const res = createResponse();

  await recordInvoicePaymentController(req, res, () => undefined);

  assert.equal(res.statusCode, 422);
  assert.equal(res.renderedView, "pages/invoices/detail.njk");
  assert.deepEqual((res.renderedData as { paymentErrors: unknown }).paymentErrors, {
    amount: ["Payment cannot exceed the outstanding balance."],
  });
});
