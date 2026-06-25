# Node Invoicing

A server-rendered invoicing application built with Node.js, Express, TypeScript, Prisma, PostgreSQL, Nunjucks, Tailwind CSS, and a small CSP-safe frontend bundle.

The app supports a multi-organization invoicing workflow with:

- Session-based auth, password reset, password changes, and active-session revocation.
- Organization ownership through memberships and organization switching.
- Organization-scoped dashboard, customers, catalog items, invoices, payments, and settings.
- Draft invoice creation/editing, issued invoices with immutable snapshots, voiding, and print views.
- Payment recording with outstanding-balance checks and separate invoice/payment status display.
- Postmark invoice email delivery with webhook updates and public tokenized invoice links.
- Per-invoice currency and organization locale formatting.
- Spanish organization support for IRPF withholding and Veri*Factu fiscal records.
- AEAT Veri*Factu preproduction SOAP submission/query scripts with persisted responses.
- Server-rendered pages with progressive client-side enhancements and a strict CSP.

## README Maintenance

This README is intentionally a product and operations overview. It should describe stable capabilities, setup, commands, and integration boundaries.

To avoid documentation rot:

- Keep enum values, table columns, and exact validation rules in `prisma/schema.prisma` and module schemas.
- Keep route-level behavior close to controllers and route files under `src/modules/`.
- Update this README when a capability appears, disappears, or changes operationally.
- Avoid duplicating long implementation details here when a code reference is clearer.

## Tech Stack

- Runtime: Node.js
- Package manager: pnpm
- Server: Express 5
- Views: Nunjucks
- Database: PostgreSQL
- ORM: Prisma
- Styling: Tailwind CSS
- Frontend bundle: esbuild + plain TypeScript enhancements
- Validation: Zod
- Auth sessions: `express-session` + `connect-flash`
- Security headers: Helmet
- Tests: Node's built-in test runner

## Getting Started

Install dependencies:

```sh
pnpm install
```

Create a local environment file:

```sh
cp .env.example .env
```

Set the required variables in `.env`:

```env
DATABASE_URL="postgresql://USER@localhost:5432/node_invoicing?schema=public"
TEST_DATABASE_URL="postgresql://test:test@localhost:5432/test"
APP_URL="http://localhost:3000"
POSTMARK_SERVER_TOKEN=""
POSTMARK_FROM="SaaS Billing <billing@example.com>"
POSTMARK_API_URL="https://api.postmarkapp.com/email"
POSTMARK_MESSAGE_STREAM="outbound"
POSTMARK_WEBHOOK_USERNAME=""
POSTMARK_WEBHOOK_PASSWORD=""
PORT=3000
SESSION_SECRET="replace-this-in-production"
NODE_ENV="development"
```

AEAT Veri*Factu preproduction scripts use optional certificate settings when you run them:

```env
VERIFACTU_AEAT_ENV="test"
VERIFACTU_CERT_PATH="/absolute/path/to/certificate.p12"
VERIFACTU_CERT_PASSPHRASE=""
VERIFACTU_TEST_ENDPOINT=""
```

Leave these unset for ordinary local development unless you are testing AEAT preproduction SOAP calls.

Run Prisma migrations:

```sh
pnpm prisma:migrate
```

Generate the Prisma client if needed:

```sh
pnpm prisma:generate
```

Start the development server:

```sh
pnpm dev
```

The app runs on `http://localhost:3000` by default.

## Scripts

```sh
pnpm dev
```

Runs CSS, JS, and server watchers together.

```sh
pnpm build
```

Builds Tailwind CSS, bundles frontend TypeScript, and compiles server TypeScript into `dist/`.

```sh
pnpm test
```

Builds the project and runs compiled `*.test.js` files with Node's built-in test runner. The test command uses `NODE_ENV=test` and `DATABASE_URL=postgresql://test:test@localhost:5432/test`.

```sh
pnpm db:test:setup
```

Creates or repairs the default local PostgreSQL test role/database used by e2e tests: `postgresql://test:test@localhost:5432/test`. The setup command connects as `TEST_DATABASE_ADMIN_URL`, `DATABASE_ADMIN_URL`, or `postgresql://localhost:5432/postgres` by default, so your local PostgreSQL user must be allowed to create roles and databases.

If you prefer a different test database, set `TEST_DATABASE_URL` before running setup and tests:

```sh
TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/node_invoicing_test" pnpm db:test:setup
TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/node_invoicing_test" pnpm test:e2e
```

```sh
pnpm test:e2e
```

Builds the app, applies Prisma migrations to `TEST_DATABASE_URL` or the default test database, starts the compiled server on port `4173`, and runs Playwright e2e tests.

```sh
pnpm start
```

Runs the compiled server from `dist/server.js`.

```sh
pnpm job:verify-fiscal-chain
```

Runs the compiled fiscal-chain verification job.

```sh
pnpm verifactu:submit-test <verifactuRecordId>
pnpm verifactu:query-test <verifactuRecordId>
```

Submits or queries a single persisted Veri*Factu record against AEAT preproduction. These scripts require a prior `pnpm build`, `VERIFACTU_AEAT_ENV=test`, and a client certificate path. They log the SOAP endpoint, request XML, HTTP status, response XML, parsed result, and persisted status.

```sh
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:studio
```

Prisma client generation, local migrations, and Prisma Studio.

## Application Flow

Unauthenticated users are sent to `/auth/login`. New users can register at `/auth/register`.

Registration creates:

- a `User`
- an `Organization`
- an `OrganizationMembership` with the `OWNER` role
- a regenerated authenticated session containing `userId` and `organizationId`

Login verifies the password, loads the user's first organization membership, regenerates the session, and stores the active user and organization ids.

Logout destroys the session, clears the `invoice.sid` cookie, and redirects to `/auth/login`.

After authentication, app data is scoped to the active organization. Organization settings are available to `OWNER` and `ADMIN` roles.

## Dashboard

The dashboard is designed as an operational view for small-business invoicing rather than a decorative analytics page.

It includes:

- top KPI cards for total invoiced this month, paid this month, outstanding balance, and overdue amount
- quick actions for creating invoices/customers, recording payments, and reviewing overdue invoices
- invoice attention sections for overdue, due soon, draft, and partially paid invoices
- a lightweight server-rendered invoiced-vs-paid monthly comparison without charting libraries
- recent activity for invoice creation, invoice email sends, recorded payments, and voided invoices

Money totals are grouped by invoice/payment currency instead of converted. There is no currency conversion yet, so mixed-currency dashboard data is shown as separate per-currency totals.

## Customers

Customers are organization-scoped and can be created, viewed, edited, archived, restored, and deleted.

Important behaviors:

- Archived customers are hidden from ordinary invoice creation and customer lists.
- Customers with invoices are not hard-deleted; they can be archived instead.
- Customer detail includes invoice and payment history.
- Issued invoices display customer data from immutable invoice snapshots, so later customer edits do not rewrite historical invoice display.

## Catalog Items

Catalog items are organization-scoped reusable invoice line templates.

They support:

- list, search, sort, pagination, archive, restore, and delete flows
- default description, unit price, currency, and tax rate values
- invoice-form autocomplete for existing items
- inline save-to-catalog behavior for free-text invoice lines

## Invoices

Invoices are organization-scoped and use organization-scoped invoice numbers.

Current invoice lifecycle:

- `DRAFT` invoices can be edited, issued, or voided.
- Issuing a draft invoice creates an immutable `InvoiceSnapshot`.
- `ISSUED` invoices can be voided and can receive payments.
- `VOID` invoices have no further invoice-status actions.

Draft invoices use live customer and organization data in the app. Issued invoices use snapshot customer and seller billing data for display and print output.

Invoice status display intentionally separates the invoice lifecycle from payment state. `Invoice.status` tracks draft/issued/void, while `Invoice.paymentStatus` tracks unpaid/partially paid/paid.

The invoice list supports filtering by invoice status, payment status, overdue state, search text, sorting, and pagination.

Invoice line items, discounts, taxes, IRPF withholding, invoice-level discounts, and totals are calculated as integer minor units. The app does not use floating-point values for stored money calculations.

Invoice notes are internal/back-office notes. They appear on the app invoice detail page, but they are not rendered on the printable invoice.

## Payments

Payments can be recorded for issued invoices that still have an outstanding balance.

Payment recording:

- locks the invoice row during the transaction
- rejects payments when the invoice is already paid
- rejects overpayments above the outstanding balance
- marks the payment state `PAID` when the balance is covered
- marks the payment state `PARTIALLY_PAID` when a balance remains

The invoice detail page shows paid and outstanding totals and hides the payment form when the outstanding balance is zero.

## Fiscal Records And Veri*Factu

Spanish organizations create fiscal evidence when invoices are issued or voided:

- issuing creates an `ALTA` fiscal record
- voiding an issued invoice creates an `ANULACION` fiscal record
- fiscal records are organization-scoped and hash-chained
- the chain can be verified with `pnpm job:verify-fiscal-chain`

For Spanish organizations, issuing also creates a persisted Veri*Factu record with the AEAT payload, XML, official huella, previous-record chain data, and local status.

The current AEAT integration is deliberately limited to preproduction scripts:

- `pnpm verifactu:submit-test <verifactuRecordId>` sends one persisted record to AEAT preproduction.
- `pnpm verifactu:query-test <verifactuRecordId>` queries one persisted record in AEAT preproduction.
- Submission responses persist raw XML, parsed result metadata, AEAT shipment/record statuses, and record-level errors.
- Query responses persist the last raw XML, parsed result metadata, query timestamp, and record-level query status/error fields.
- Accepted records are not downgraded by later submission or query responses.
- A query only sets or keeps local `ACCEPTED` when AEAT returns `ConDatos` with `EstadoRegistro=Correcto`.
- `SinDatos` and SOAP faults are stored as evidence but do not mark the record rejected.
- Known production AEAT endpoints are blocked by the SOAP config guard.

Veri*Factu software/SIF metadata is stored globally in `VerifactuSoftwareConfig`; one default config is required before Spanish invoice issuance can build a Veri*Factu payload.

This is not yet a background reconciliation system. There is no production submission mode, retry queue, UI workflow, or automatic remediation flow in the app.

## Snapshots And Printing

When a draft invoice is issued, the app captures an immutable invoice snapshot with:

- customer billing data
- seller billing data from the organization
- payment instructions
- subtotal, discount, tax, withholding, and total amounts

Issued invoices can be printed at:

```txt
/invoices/:invoiceId/print
```

The print page is a standalone A4-oriented HTML document with seller data, customer data, invoice dates, line items, totals, payment instructions, and a CSP-safe `Print` button.

Draft invoices and issued invoices without a snapshot redirect back to the invoice detail page.

## Currency And Locale

Invoices store their own `currency`. New invoices default to the organization's currency, but the selected invoice currency is stored on the invoice and remains the display source of truth.

Supported currencies:

- `EUR`
- `USD`
- `GBP`
- `CAD`
- `AUD`

Organizations also store a `locale`, used for server-rendered money formatting and frontend invoice total previews.

Supported locales:

- `en-GB`
- `en-US`
- `es-ES`

There is no currency conversion yet. Dashboard and invoice summaries show separate per-currency totals instead of converting or displaying a misleading aggregate.

## Validation And Forms

Form validation uses Zod on the server. Invalid submissions re-render the same template with field-specific errors and safe submitted values.

Examples:

- auth forms validate email, password strength, reset tokens, and password confirmation
- customer forms validate required and optional customer fields
- invoice forms validate customer ownership, supported currency, dates, line items, discounts, and taxes
- payment forms validate amount and paid date
- settings forms validate profile, organization, locale, session timeout, and password fields

Passwords are never rendered back into forms after validation failures.

Flash messages are used for completed actions across redirects. Field-level validation errors use direct `422`/`409` renders instead of flash messages.

## Frontend Behavior

The frontend bundle is intentionally small and CSP-safe. It uses plain TypeScript and `data-*` hooks for:

- invoice total calculation
- IRPF withholding controls
- catalog autocomplete and inline save-to-catalog behavior
- locale-aware money previews
- flash message auto-dismiss
- form validation enhancements
- unsaved changes guards
- native confirmation dialogs
- password visibility toggle
- print button behavior

The app does not use Alpine because the default Alpine runtime requires dynamic evaluation, which conflicts with the strict CSP.

## Security Notes

- Helmet sets security headers.
- Scripts are restricted to `script-src 'self'`.
- Inline event handlers and inline scripts are avoided.
- Session cookies are HTTP-only, `sameSite: "lax"`, and secure in production.
- Sessions are regenerated on login/register to reduce session fixation risk.
- Passwords are hashed with bcrypt before storage.
- POST forms include CSRF tokens.

## Project Structure

```txt
src/
  app.ts
  server.ts
  config/
  db/
  lib/
  middleware/
  modules/
    auth/
    customers/
    dashboard/
    invoices/
    items/
    settings/
    verifactu/
  public/
    assets/
    css/
    js/
  views/
prisma/
  schema.prisma
  migrations/
docs/
  architecture/
```

## Development Notes

- Keep generated files out of Git: `dist/` and `public/assets/` are ignored.
- Keep source assets under `src/public/`.
- Put feature validation in `*.schema.ts`.
- Keep database and business behavior in `*.service.ts` when a module grows beyond small controller logic.
- Keep controllers focused on HTTP flow: validation, rendering, sessions, flash messages, redirects, and `next(error)`.
- Scope organization-owned data by `req.auth!.organization.id`.
- Preserve strict CSP; use frontend `data-*` hooks instead of inline handlers.
- Run `pnpm test` before committing auth, session, validation, invoice, payment, or template changes.
- Run `pnpm test` before committing fiscal-record or Veri*Factu changes.
- Keep AEAT production behavior explicit; current Veri*Factu SOAP scripts are preproduction-only.

## Roadmap

See `TODO.md` for product and engineering follow-ups.

## License

MIT.
