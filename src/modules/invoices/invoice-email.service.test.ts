import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import {
  getPublicInvoiceByToken,
  recordPostmarkWebhookEvent,
  sendInvoiceEmail,
  type PostmarkEmailPayload,
} from "./invoice-email.service";

const prismaMock = prisma as unknown as {
  $transaction: unknown;
  invoice: {
    findFirst: unknown;
  };
  invoicePublicAccessToken: {
    findFirst: unknown;
  };
  invoiceEmailDelivery: {
    findFirst: unknown;
    update: unknown;
  };
  invoiceEmailEvent: {
    create: unknown;
  };
};

const originalTransaction = prismaMock.$transaction;
const originalInvoiceFindFirst = prismaMock.invoice.findFirst;
const originalPublicTokenFindFirst = prismaMock.invoicePublicAccessToken.findFirst;
const originalDeliveryFindFirst = prismaMock.invoiceEmailDelivery.findFirst;
const originalDeliveryUpdate = prismaMock.invoiceEmailDelivery.update;
const originalEventCreate = prismaMock.invoiceEmailEvent.create;
const originalEnv = {
  APP_URL: env.APP_URL,
  POSTMARK_FROM: env.POSTMARK_FROM,
  POSTMARK_MESSAGE_STREAM: env.POSTMARK_MESSAGE_STREAM,
};

afterEach(() => {
  prismaMock.$transaction = originalTransaction;
  prismaMock.invoice.findFirst = originalInvoiceFindFirst;
  prismaMock.invoicePublicAccessToken.findFirst = originalPublicTokenFindFirst;
  prismaMock.invoiceEmailDelivery.findFirst = originalDeliveryFindFirst;
  prismaMock.invoiceEmailDelivery.update = originalDeliveryUpdate;
  prismaMock.invoiceEmailEvent.create = originalEventCreate;
  env.APP_URL = originalEnv.APP_URL;
  env.POSTMARK_FROM = originalEnv.POSTMARK_FROM;
  env.POSTMARK_MESSAGE_STREAM = originalEnv.POSTMARK_MESSAGE_STREAM;
});

const invoice = {
  id: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
  organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
  customerId: "59cad9c9-16c1-4c85-83e1-6630514781a0",
  number: "INV-2026-0001",
  status: "SENT",
  issueDate: new Date("2026-05-27T00:00:00.000Z"),
  dueDate: new Date("2026-06-27T00:00:00.000Z"),
  subtotalCents: 10000,
  discountCents: 0,
  taxCents: 2100,
  totalCents: 12100,
  currency: "EUR",
  notes: null,
  createdAt: new Date("2026-05-27T00:00:00.000Z"),
  updatedAt: new Date("2026-05-27T00:00:00.000Z"),
  customer: {
    id: "59cad9c9-16c1-4c85-83e1-6630514781a0",
    organizationId: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    name: "Ada Co",
    email: "billing@ada.example",
    taxId: null,
    addressLine1: null,
    city: null,
    country: null,
    archivedAt: null,
    createdAt: new Date("2026-05-27T00:00:00.000Z"),
    updatedAt: new Date("2026-05-27T00:00:00.000Z"),
  },
  organization: {
    id: "5a87c29e-7f69-4ee0-b1c0-1478690fe5ab",
    name: "Analytical Engines",
    legalName: "Analytical Engines Ltd",
    billingEmail: "billing@example.com",
    taxId: "VAT123",
    addressLine1: "1 Seller St",
    city: "Madrid",
    country: "ES",
    currency: "EUR",
    locale: "en-GB",
    paymentInstructions: "Pay by bank transfer.",
    createdAt: new Date("2026-05-27T00:00:00.000Z"),
    updatedAt: new Date("2026-05-27T00:00:00.000Z"),
  },
  snapshot: {
    invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
    customerName: "Snapshot Ada Co",
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
    paymentInstructions: "Pay by bank transfer.",
    subtotalCents: 10000,
    discountCents: 0,
    taxCents: 2100,
    totalCents: 12100,
    createdAt: new Date("2026-05-27T00:00:00.000Z"),
  },
  lines: [
    {
      id: "line_1",
      invoiceId: "5c4a11e6-daa1-48c0-8fd5-ed4ca6d0d75c",
      description: "Consulting",
      quantity: 1,
      unitPriceCents: 10000,
      discountCents: 0,
      invoiceDiscountCents: 0,
      taxRateBps: 2100,
      taxCents: 2100,
      totalCents: 12100,
      createdAt: new Date("2026-05-27T00:00:00.000Z"),
    },
  ],
  payments: [],
  emailDeliveries: [],
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

test("sendInvoiceEmail rejects draft invoices without creating deliveries", async () => {
  let transactionCalls = 0;
  prismaMock.invoice.findFirst = async () => ({
    ...invoice,
    status: "DRAFT",
    snapshot: null,
  });
  prismaMock.$transaction = async () => {
    transactionCalls += 1;
  };

  const result = await sendInvoiceEmail(
    invoice.organizationId,
    invoice.id,
    { toEmail: "customer@example.com" },
    async () => {
      throw new Error("provider should not be called");
    },
  );

  assert.deepEqual(result, { ok: false, reason: "notPrintable" });
  assert.equal(transactionCalls, 0);
});

test("sendInvoiceEmail creates a hashed public token and sends html plus text through Postmark", async () => {
  let publicTokenCreateArgs: { data: { tokenHash: string } } | undefined;
  let deliveryCreateArgs: unknown;
  let deliveryUpdateArgs: unknown;
  let postmarkPayload: PostmarkEmailPayload | undefined;
  env.APP_URL = "https://billing.example.com";
  env.POSTMARK_FROM = "SaaS Billing <billing@saas.example>";
  env.POSTMARK_MESSAGE_STREAM = "outbound";
  prismaMock.invoice.findFirst = async () => invoice;
  prismaMock.$transaction = async (
    callback: (tx: {
      invoicePublicAccessToken: {
        create: (args: { data: { tokenHash: string } }) => Promise<unknown>;
      };
      invoiceEmailDelivery: {
        create: (args: unknown) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoicePublicAccessToken: {
        async create(args) {
          publicTokenCreateArgs = args;
          return { id: "token_1", ...args.data };
        },
      },
      invoiceEmailDelivery: {
        async create(args) {
          deliveryCreateArgs = args;
          return { id: "delivery_1" };
        },
      },
    });
  prismaMock.invoiceEmailDelivery.update = async (args: unknown) => {
    deliveryUpdateArgs = args;
    return { id: "delivery_1" };
  };

  const result = await sendInvoiceEmail(
    invoice.organizationId,
    invoice.id,
    { toEmail: "customer@example.com" },
    async (payload) => {
      postmarkPayload = payload;
      return {
        ok: true,
        providerMessageId: "postmark-message-1",
        submittedAt: "2026-06-03T12:00:00.000Z",
        response: { MessageID: "postmark-message-1" },
      };
    },
  );

  assert.equal(result.ok, true);
  assert.ok(postmarkPayload);
  assert.equal(postmarkPayload.From, "SaaS Billing <billing@saas.example>");
  assert.equal(postmarkPayload.To, "customer@example.com");
  assert.equal(postmarkPayload.ReplyTo, "billing@example.com");
  assert.match(postmarkPayload.HtmlBody, /https:\/\/billing\.example\.com\/public\/invoices\//);
  assert.match(postmarkPayload.TextBody, /https:\/\/billing\.example\.com\/public\/invoices\//);
  assert.equal(postmarkPayload.Metadata.deliveryId, "delivery_1");

  const rawToken = postmarkPayload.TextBody.match(/\/public\/invoices\/([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(rawToken);
  assert.equal(publicTokenCreateArgs?.data.tokenHash, hashToken(rawToken));
  assert.notEqual(publicTokenCreateArgs?.data.tokenHash, rawToken);
  assert.deepEqual(deliveryCreateArgs, {
    data: {
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      publicAccessTokenId: "token_1",
      toEmail: "customer@example.com",
      subject: "Invoice INV-2026-0001 from Analytical Engines Ltd",
      status: "PENDING",
    },
  });
  assert.deepEqual(deliveryUpdateArgs, {
    where: { id: "delivery_1" },
    data: {
      status: "SENT",
      providerMessageId: "postmark-message-1",
      sentAt: new Date("2026-06-03T12:00:00.000Z"),
      metadata: {
        postmarkPayload: postmarkPayload,
        postmarkResponse: { MessageID: "postmark-message-1" },
      },
    },
  });
});

test("sendInvoiceEmail logs provider failures", async () => {
  let deliveryUpdateArgs: unknown;
  prismaMock.invoice.findFirst = async () => invoice;
  prismaMock.$transaction = async (
    callback: (tx: {
      invoicePublicAccessToken: { create: () => Promise<unknown> };
      invoiceEmailDelivery: { create: () => Promise<unknown> };
    }) => Promise<unknown>,
  ) =>
    callback({
      invoicePublicAccessToken: {
        async create() {
          return { id: "token_1" };
        },
      },
      invoiceEmailDelivery: {
        async create() {
          return { id: "delivery_1" };
        },
      },
    });
  prismaMock.invoiceEmailDelivery.update = async (args: unknown) => {
    deliveryUpdateArgs = args;
    return { id: "delivery_1" };
  };

  const result = await sendInvoiceEmail(
    invoice.organizationId,
    invoice.id,
    { toEmail: "customer@example.com" },
    async () => ({
      ok: false,
      errorMessage: "Inactive recipient",
      response: { Message: "Inactive recipient" },
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "providerFailure",
    deliveryId: "delivery_1",
    errorMessage: "Inactive recipient",
  });
  assert.deepEqual(deliveryUpdateArgs, {
    where: { id: "delivery_1" },
    data: {
      status: "FAILED",
      failedAt: deliveryUpdateArgs && (deliveryUpdateArgs as { data: { failedAt: Date } }).data.failedAt,
      errorMessage: "Inactive recipient",
      metadata: {
        postmarkPayload: (deliveryUpdateArgs as { data: { metadata: { postmarkPayload: unknown } } }).data.metadata.postmarkPayload,
        postmarkResponse: { Message: "Inactive recipient" },
      },
    },
  });
});

test("recordPostmarkWebhookEvent stores events and updates delivery status", async () => {
  let eventCreateArgs: unknown;
  let deliveryUpdateArgs: unknown;
  prismaMock.invoiceEmailDelivery.findFirst = async () => ({
    id: "delivery_1",
    metadata: { existing: true },
  });
  prismaMock.invoiceEmailEvent.create = async (args: unknown) => {
    eventCreateArgs = args;
    return { id: "event_1" };
  };
  prismaMock.invoiceEmailDelivery.update = async (args: unknown) => {
    deliveryUpdateArgs = args;
    return { id: "delivery_1" };
  };

  const result = await recordPostmarkWebhookEvent({
    RecordType: "Delivery",
    MessageID: "postmark-message-1",
  });

  assert.deepEqual(result, { ok: true, statusUpdated: true });
  assert.deepEqual(eventCreateArgs, {
    data: {
      deliveryId: "delivery_1",
      providerMessageId: "postmark-message-1",
      recordType: "Delivery",
      payload: {
        RecordType: "Delivery",
        MessageID: "postmark-message-1",
      },
    },
  });
  assert.equal((deliveryUpdateArgs as { data: { status: string } }).data.status, "DELIVERED");
  assert.ok((deliveryUpdateArgs as { data: { deliveredAt: Date } }).data.deliveredAt instanceof Date);
});

test("getPublicInvoiceByToken looks up invoices by token hash", async () => {
  let findFirstArgs: unknown;
  prismaMock.invoicePublicAccessToken.findFirst = async (args: unknown) => {
    findFirstArgs = args;
    return { invoice };
  };

  const result = await getPublicInvoiceByToken("public-token");

  assert.equal(result, invoice);
  assert.deepEqual(findFirstArgs, {
    where: {
      tokenHash: hashToken("public-token"),
      revokedAt: null,
    },
    include: {
      invoice: {
        include: {
          customer: true,
          organization: true,
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
      },
    },
  });
});
