# Node Invoicing

A server-rendered invoicing application built with Node.js, Express, TypeScript, Prisma, PostgreSQL, Nunjucks, Tailwind CSS, and a small CSP-safe frontend bundle.

The app currently supports a multi-organization invoicing workflow with:

- User registration, login, logout, and session-based auth.
- Organization ownership through memberships.
- Organization-scoped dashboard metrics.
- Organization-scoped customer management, including edit, archive, restore, and delete flows.
- Draft invoice creation and editing.
- Invoice status transitions for sending, marking overdue, voiding, and paid states.
- Immutable invoice snapshots when draft invoices are issued.
- Payment recording with outstanding-balance checks.
- HTML print view for issued invoices, designed for browser print/save-as-PDF.
- Postmark invoice email delivery with public tokenized invoice links.
- Per-invoice currency and organization locale formatting.
- Organization settings for seller billing data, billing email, default currency, locale, and payment instructions.
- Server-rendered pages with progressive client-side enhancements.
- Strict Content Security Policy without inline scripts, `unsafe-eval`, or `unsafe-inline`.

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

## Customers

Customers are organization-scoped and can be created, viewed, edited, archived, restored, and deleted.

Important behaviors:

- Archived customers are hidden from ordinary invoice creation and customer lists.
- Customers with invoices are not hard-deleted; they can be archived instead.
- Customer detail includes invoice and payment history.
- Issued invoices display customer data from immutable invoice snapshots, so later customer edits do not rewrite historical invoice display.

## Invoices

Invoices are organization-scoped and use organization-scoped invoice numbers.

Current invoice lifecycle:

- `DRAFT` invoices can be edited or voided.
- `DRAFT` invoices can be marked sent.
- Sending a draft invoice creates an immutable `InvoiceSnapshot`.
- `SENT` and `PARTIALLY_PAID` invoices can be marked overdue or voided.
- `OVERDUE` invoices can be voided.
- `PAID` and `VOID` invoices have no further status actions.

Draft invoices use live customer and organization data in the app. Issued invoices use snapshot customer and seller billing data for display and print output.

Invoice line items, discounts, taxes, invoice-level discounts, and totals are calculated as integer minor units. The app does not use floating-point values for stored money calculations.

Invoice notes are internal/back-office notes. They appear on the app invoice detail page, but they are not rendered on the printable invoice.

## Payments

Payments can be recorded for open issued invoices:

- `SENT`
- `PARTIALLY_PAID`
- `OVERDUE`

Payment recording:

- locks the invoice row during the transaction
- rejects payments when the invoice is already paid
- rejects overpayments above the outstanding balance
- marks invoices `PAID` when the balance is covered
- marks invoices `PARTIALLY_PAID` or keeps them `OVERDUE` when a balance remains

The invoice detail page shows paid and outstanding totals and hides the payment form when the outstanding balance is zero.

## Snapshots And Printing

When a draft invoice is marked sent, the app captures an immutable invoice snapshot with:

- customer billing data
- seller billing data from the organization
- payment instructions
- subtotal, discount, tax, and total amounts

Issued invoices can be printed at:

```txt
/invoices/:invoiceId/print
```

The print page is a standalone A4-oriented HTML document with seller data, customer data, invoice dates, line items, totals, payment instructions, and a CSP-safe `Print / Save as PDF` button.

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

There is no currency conversion yet. If dashboard open invoices span multiple currencies, the dashboard shows a mixed-currency state instead of converting or displaying a misleading aggregate.

## Validation And Forms

Form validation uses Zod on the server. Invalid submissions re-render the same template with field-specific errors and safe submitted values.

Examples:

- register validates email, password strength, and organization name
- customer forms validate required and optional customer fields
- invoice forms validate customer ownership, supported currency, dates, line items, discounts, and taxes
- payment forms validate amount and paid date
- settings forms validate supported currency and locale

Passwords are never rendered back into forms after validation failures.

Flash messages are used for completed actions across redirects. Field-level validation errors use direct `422`/`409` renders instead of flash messages.

## Frontend Behavior

The frontend bundle is intentionally small and CSP-safe. It uses plain TypeScript and `data-*` hooks for:

- invoice total calculation
- locale-aware money previews
- flash message auto-dismiss
- register form inline validation
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
    settings/
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

## Roadmap

See `TODO.md` for product and engineering follow-ups.

## License

MIT.
