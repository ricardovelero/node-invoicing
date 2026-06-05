import type { InvoiceEmailDeliveryStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import nunjucks from 'nunjucks';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { formatDate } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import type { InvoiceEmailForm } from './invoice-email.schema';
import { createInvoiceDisplay } from './invoice.presenter';
import {
  calculateInvoicePaymentSummary,
  isInvoiceEffectivelyOverdue,
} from './invoice.service';

type EmailInvoice = NonNullable<Awaited<ReturnType<typeof getEmailInvoice>>>;
type PublicInvoice = NonNullable<
  Awaited<ReturnType<typeof getPublicInvoiceByToken>>
>;

export type PostmarkWebhookPayload = {
  RecordType?: string;
  MessageID?: string;
  MessageId?: string;
  Details?: string;
  Description?: string;
  Type?: string;
  [key: string]: unknown;
};

export type PostmarkEmailPayload = {
  From: string;
  To: string;
  Subject: string;
  HtmlBody: string;
  TextBody: string;
  ReplyTo?: string;
  Tag: string;
  Metadata: Record<string, string>;
  MessageStream: string;
  TrackOpens: boolean;
  TrackLinks: 'None';
};

export type SendPostmarkEmail = (payload: PostmarkEmailPayload) => Promise<
  | {
      ok: true;
      providerMessageId: string;
      submittedAt?: string;
      response: unknown;
    }
  | { ok: false; errorMessage: string; response?: unknown }
>;

const emailViewsPath = path.join(process.cwd(), 'src', 'views');
const emailNunjucksEnv = nunjucks.configure(emailViewsPath, {
  autoescape: true,
  noCache: env.NODE_ENV === 'development',
});

emailNunjucksEnv.addFilter('money', formatMoney);
emailNunjucksEnv.addFilter('date', formatDate);

const getAppUrl = () =>
  (env.APP_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, '');

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const createPublicToken = () => randomBytes(32).toString('base64url');

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const normalizeBasicAuthValue = (value: string) => Buffer.from(value, 'utf8');

const safeEqual = (left: string, right: string) => {
  const leftBuffer = normalizeBasicAuthValue(left);
  const rightBuffer = normalizeBasicAuthValue(right);

  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(rightBuffer, Buffer.alloc(rightBuffer.length));
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const isValidPostmarkWebhookBasicAuth = (authorization?: string) => {
  if (!env.POSTMARK_WEBHOOK_USERNAME || !env.POSTMARK_WEBHOOK_PASSWORD) {
    return false;
  }

  if (!authorization?.startsWith('Basic ')) {
    return false;
  }

  const decoded = Buffer.from(authorization.slice(6), 'base64').toString(
    'utf8',
  );
  const separatorIndex = decoded.indexOf(':');

  if (separatorIndex === -1) {
    return false;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return (
    safeEqual(username, env.POSTMARK_WEBHOOK_USERNAME) &&
    safeEqual(password, env.POSTMARK_WEBHOOK_PASSWORD)
  );
};

const postmarkEmailProvider: SendPostmarkEmail = async (payload) => {
  if (!env.POSTMARK_SERVER_TOKEN || !env.POSTMARK_FROM) {
    return {
      ok: false,
      errorMessage:
        'Postmark is not configured. Set POSTMARK_SERVER_TOKEN and POSTMARK_FROM.',
    };
  }

  const response = await fetch(env.POSTMARK_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(payload),
  });
  const responseBody = (await response.json().catch(() => ({}))) as {
    MessageID?: string;
    SubmittedAt?: string;
    Message?: string;
    ErrorCode?: number;
  };

  if (!response.ok || responseBody.ErrorCode) {
    return {
      ok: false,
      errorMessage:
        responseBody.Message ??
        `Postmark returned HTTP ${response.status} while sending email.`,
      response: responseBody,
    };
  }

  if (!responseBody.MessageID) {
    return {
      ok: false,
      errorMessage: 'Postmark did not return a message id.',
      response: responseBody,
    };
  }

  return {
    ok: true,
    providerMessageId: responseBody.MessageID,
    submittedAt: responseBody.SubmittedAt,
    response: responseBody,
  };
};

const invoiceEmailInclude = {
  customer: true,
  organization: true,
  snapshot: true,
  lines: {
    orderBy: { createdAt: 'asc' },
  },
  payments: {
    orderBy: { paidAt: 'desc' },
  },
  emailDeliveries: {
    orderBy: { createdAt: 'desc' },
    take: 10,
  },
} satisfies Prisma.InvoiceInclude;

export const getEmailInvoice = (organizationId: string, invoiceId: string) =>
  prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: invoiceEmailInclude,
  });

export const isInvoiceEmailReady = (invoice: EmailInvoice) => {
  const invoiceDisplay = createInvoiceDisplay(invoice);

  return invoiceDisplay.isPrintable && Boolean(invoiceDisplay.snapshot);
};

const sellerName = (invoice: EmailInvoice | PublicInvoice) => {
  const display = createInvoiceDisplay(invoice);

  return (
    display.snapshot?.sellerLegalName ??
    display.snapshot?.sellerName ??
    invoice.organization.legalName ??
    invoice.organization.name
  );
};

const createEmailSubject = (invoice: EmailInvoice) =>
  `Invoice ${invoice.number} from ${sellerName(invoice)}`;

const createPublicInvoiceUrl = (token: string) =>
  `${getAppUrl()}/public/invoices/${encodeURIComponent(token)}`;

const createPublicAccessToken = async (
  tx: Prisma.TransactionClient,
  invoice: EmailInvoice,
) => {
  const token = createPublicToken();
  const publicAccessToken = await tx.invoicePublicAccessToken.create({
    data: {
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      tokenHash: hashToken(token),
    },
  });

  return { token, publicAccessToken };
};

const renderInvoiceEmailBodies = (data: {
  invoice: EmailInvoice;
  publicInvoiceUrl: string;
}) => {
  const invoiceDisplay = createInvoiceDisplay(data.invoice);
  const paymentSummary = calculateInvoicePaymentSummary(data.invoice);
  const templateData = {
    invoice: data.invoice,
    invoiceDisplay,
    isEffectivelyOverdue: isInvoiceEffectivelyOverdue(data.invoice),
    paymentSummary,
    publicInvoiceUrl: data.publicInvoiceUrl,
    sellerName: sellerName(data.invoice),
    currentOrganization: data.invoice.organization,
  };

  return {
    htmlBody: emailNunjucksEnv.render(
      'emails/invoices/send-html.njk',
      templateData,
    ),
    textBody: emailNunjucksEnv.render(
      'emails/invoices/send-text.njk',
      templateData,
    ),
  };
};

const buildPostmarkPayload = (
  invoice: EmailInvoice,
  deliveryId: string,
  form: InvoiceEmailForm,
  publicInvoiceUrl: string,
) => {
  const subject = createEmailSubject(invoice);
  const { htmlBody, textBody } = renderInvoiceEmailBodies({
    invoice,
    publicInvoiceUrl,
  });

  return {
    From: env.POSTMARK_FROM ?? '',
    To: form.toEmail,
    Subject: subject,
    HtmlBody: htmlBody,
    TextBody: textBody,
    ReplyTo: invoice.organization.billingEmail ?? undefined,
    Tag: 'invoice',
    Metadata: {
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      deliveryId,
      invoiceNumber: invoice.number,
    },
    MessageStream: env.POSTMARK_MESSAGE_STREAM,
    TrackOpens: false,
    TrackLinks: 'None' as const,
  };
};

export const sendInvoiceEmail = async (
  organizationId: string,
  invoiceId: string,
  form: InvoiceEmailForm,
  sendPostmarkEmail: SendPostmarkEmail = postmarkEmailProvider,
) => {
  const invoice = await getEmailInvoice(organizationId, invoiceId);

  if (!invoice) {
    return { ok: false as const, reason: 'notFound' as const };
  }

  if (!isInvoiceEmailReady(invoice)) {
    return { ok: false as const, reason: 'notPrintable' as const };
  }

  if (!invoice.organization.billingEmail) {
    return { ok: false as const, reason: 'missingBillingEmail' as const };
  }

  const subject = createEmailSubject(invoice);
  const { token, delivery: createdDelivery } = await prisma.$transaction(
    async (tx) => {
      const access = await createPublicAccessToken(tx, invoice);
      const delivery = await tx.invoiceEmailDelivery.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          publicAccessTokenId: access.publicAccessToken.id,
          toEmail: form.toEmail,
          subject,
          status: 'PENDING',
        },
      });

      return { ...access, delivery };
    },
  );
  const publicInvoiceUrl = createPublicInvoiceUrl(token);
  const payload = buildPostmarkPayload(
    invoice,
    createdDelivery.id,
    form,
    publicInvoiceUrl,
  );
  const sendResult = await sendPostmarkEmail(payload);

  if (!sendResult.ok) {
    await prisma.invoiceEmailDelivery.update({
      where: { id: createdDelivery.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: sendResult.errorMessage,
        metadata: {
          postmarkPayload: toJsonValue(payload),
          postmarkResponse: toJsonValue(sendResult.response ?? null),
        },
      },
    });

    return {
      ok: false as const,
      reason: 'providerFailure' as const,
      deliveryId: createdDelivery.id,
      errorMessage: sendResult.errorMessage,
    };
  }

  const sentDelivery = await prisma.invoiceEmailDelivery.update({
    where: { id: createdDelivery.id },
    data: {
      status: 'SENT',
      providerMessageId: sendResult.providerMessageId,
      sentAt:
        sendResult.submittedAt ? new Date(sendResult.submittedAt) : new Date(),
      metadata: {
        postmarkPayload: toJsonValue(payload),
        postmarkResponse: toJsonValue(sendResult.response),
      },
    },
  });

  return {
    ok: true as const,
    delivery: sentDelivery,
    publicInvoiceUrl,
  };
};

const webhookStatusMap: Partial<Record<string, InvoiceEmailDeliveryStatus>> = {
  Delivery: 'DELIVERED',
  Bounce: 'BOUNCED',
  SpamComplaint: 'SPAM_COMPLAINT',
  SmtpApiError: 'FAILED',
  SMTPAPIError: 'FAILED',
};

const messageIdFromWebhook = (payload: PostmarkWebhookPayload) =>
  typeof payload.MessageID === 'string' ? payload.MessageID
  : typeof payload.MessageId === 'string' ? payload.MessageId
  : null;

export const recordPostmarkWebhookEvent = async (
  payload: PostmarkWebhookPayload,
) => {
  const providerMessageId = messageIdFromWebhook(payload);
  const recordType =
    typeof payload.RecordType === 'string' ? payload.RecordType : 'Unknown';
  const status = webhookStatusMap[recordType];
  const delivery =
    providerMessageId ?
      await prisma.invoiceEmailDelivery.findFirst({
        where: { providerMessageId },
      })
    : null;

  await prisma.invoiceEmailEvent.create({
    data: {
      deliveryId: delivery?.id,
      providerMessageId,
      recordType,
      payload: payload as Prisma.InputJsonObject,
    },
  });

  if (!delivery || !status) {
    return { ok: true as const, statusUpdated: false };
  }

  const now = new Date();
  const updateData: Prisma.InvoiceEmailDeliveryUpdateInput = {
    status,
    metadata: {
      ...((
        delivery.metadata &&
        typeof delivery.metadata === 'object' &&
        !Array.isArray(delivery.metadata)
      ) ?
        delivery.metadata
      : {}),
      lastWebhookPayload: toJsonValue(payload),
    },
  };

  if (status === 'DELIVERED') {
    updateData.deliveredAt = now;
  }

  if (
    status === 'FAILED' ||
    status === 'BOUNCED' ||
    status === 'SPAM_COMPLAINT'
  ) {
    updateData.failedAt = now;
    updateData.errorMessage =
      typeof payload.Description === 'string' ? payload.Description
      : typeof payload.Details === 'string' ? payload.Details
      : typeof payload.Type === 'string' ? payload.Type
      : null;
  }

  await prisma.invoiceEmailDelivery.update({
    where: { id: delivery.id },
    data: updateData,
  });

  return { ok: true as const, statusUpdated: true };
};

export const getPublicInvoiceByToken = async (token: string) => {
  const tokenHash = hashToken(token);
  const publicAccessToken = await prisma.invoicePublicAccessToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
    },
    include: {
      invoice: {
        include: invoiceEmailInclude,
      },
    },
  });

  return publicAccessToken?.invoice ?? null;
};
