import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://test:test@localhost:5432/test";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

const dateInput = (daysFromToday: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
};

const resetDatabase = async () => {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.invoiceSnapshot.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.invoiceNumberSequence.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.organizationMembership.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);
};

const register = async (page: Page, suffix: string) => {
  await page.goto("/auth/register");

  await page.getByLabel("Name", { exact: true }).fill(`E2E User ${suffix}`);
  await page.getByLabel(/^Email/).fill(`e2e-${suffix}@example.test`);
  await page.getByLabel(/^Password/).fill("StrongPass1");
  await page.getByLabel(/^Organization/).fill(`E2E Org ${suffix}`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
};

const createCustomer = async (page: Page, suffix: string) => {
  const customerName = `Acme E2E ${suffix}`;

  await page.getByRole("link", { name: "Customers" }).click();
  await page.getByRole("link", { name: "New customer" }).click();

  await page.getByLabel("Name", { exact: true }).fill(customerName);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`billing-${suffix}@example.test`);
  await page.getByLabel("Tax ID").fill(`TAX-${suffix}`);
  await page.getByLabel("Address").fill("100 Test Avenue");
  await page.getByLabel("City").fill("Madrid");
  await page.getByLabel("Country").fill("Spain");
  await page.getByRole("button", { name: "Create customer" }).click();

  await expect(page).toHaveURL("/customers");
  await expect(page.getByRole("link", { name: customerName })).toBeVisible();

  return customerName;
};

const fillInvoiceLine = async (
  page: Page,
  {
    description,
    quantity,
    unitPrice,
    taxRate = "0",
  }: {
    description: string;
    quantity: string;
    unitPrice: string;
    taxRate?: string;
  },
) => {
  const line = page.locator("[data-invoice-line]").first();

  await line.locator("[data-invoice-description]").fill(description);
  await line.locator("[data-invoice-quantity]").fill(quantity);
  await line.locator("[data-invoice-unit-price]").fill(unitPrice);
  await line.locator("[data-invoice-tax-rate]").fill(taxRate);
};

const createDraftInvoice = async (
  page: Page,
  customerName: string,
  lineDescription = "Implementation sprint",
) => {
  await page.getByRole("link", { name: "Invoices" }).click();
  await page.getByRole("link", { name: "New invoice" }).click();

  await page.getByLabel(/^Customer/).selectOption({
    label: customerName,
  });
  await page.getByLabel(/^Currency/).selectOption("EUR");
  await page.getByLabel("Issue date").fill(dateInput(0));
  await page.getByLabel("Due date").fill(dateInput(30));
  await fillInvoiceLine(page, {
    description: lineDescription,
    quantity: "2",
    unitPrice: "500",
    taxRate: "20",
  });
  await page.getByLabel("Notes").fill("Initial project delivery.");
  await page.getByRole("button", { name: "Create invoice" }).click();

  await expect(page).toHaveURL("/invoices");
  await page.getByRole("link", { name: /^INV-\d{4}-\d{4}$/ }).click();
  await expect(
    page.getByRole("heading", { name: /^INV-\d{4}-\d{4}$/ }),
  ).toBeVisible();
  await expect(page.getByText("DRAFT").first()).toBeVisible();
};

const registerAndCreateDraftInvoice = async (page: Page, suffix: string) => {
  await register(page, suffix);
  const customerName = await createCustomer(page, suffix);
  await createDraftInvoice(page, customerName);

  return { customerName };
};

const markInvoiceSent = async (page: Page) => {
  await page.getByRole("button", { name: "Mark sent" }).click();

  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
  await expect(page.getByText("SENT").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Print / Save as PDF" }),
  ).toBeVisible();
};

const recordPayment = async (page: Page, amount: string, reference: string) => {
  await page.locator("#paymentAmount").fill(amount);
  await page.locator("#paidAt").fill(dateInput(0));
  await page.locator("#reference").fill(reference);
  await page.getByRole("button", { name: "Record payment" }).click();
};

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("registers, creates and edits a draft invoice, sends it, and opens the print view", async ({
  page,
}, testInfo) => {
  const suffix = `print-${testInfo.workerIndex}-${Date.now()}`;
  const { customerName } = await registerAndCreateDraftInvoice(page, suffix);

  await page.getByRole("link", { name: "Edit invoice" }).click();
  await expect(page.getByRole("heading", { name: /^Edit INV-/ })).toBeVisible();
  await fillInvoiceLine(page, {
    description: "Updated implementation sprint",
    quantity: "3",
    unitPrice: "450",
    taxRate: "20",
  });
  await page.getByLabel("Notes").fill("Updated project delivery.");
  await page.getByRole("button", { name: "Save invoice" }).click();

  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("cell", { name: "Updated implementation sprint" }),
  ).toBeVisible();
  await expect(page.getByText("Updated project delivery.")).toBeVisible();

  await markInvoiceSent(page);
  await page.getByRole("link", { name: "Print / Save as PDF" }).click();

  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+\/print$/);
  await expect(page.getByRole("heading", { name: "Customer" })).toBeVisible();
  await expect(page.getByText(customerName)).toBeVisible();
  await expect(page.getByText("Updated implementation sprint")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print / Save as PDF" }),
  ).toBeVisible();
});

test("records partial and final payments until the invoice is paid", async ({
  page,
}, testInfo) => {
  const suffix = `payments-${testInfo.workerIndex}-${Date.now()}`;
  await registerAndCreateDraftInvoice(page, suffix);
  await markInvoiceSent(page);

  await recordPayment(page, "300", "partial-payment");

  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
  await expect(page.getByText("PARTIALLY_PAID").first()).toBeVisible();
  await expect(page.getByText("partial-payment")).toBeVisible();
  await expect(page.getByText("€900.00")).toBeVisible();

  await recordPayment(page, "900", "final-payment");

  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
  await expect(page.getByText("PAID").first()).toBeVisible();
  await expect(page.getByText("final-payment")).toBeVisible();
  await expect(page.getByText("€0.00").last()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Record payment" }),
  ).toHaveCount(0);
});
