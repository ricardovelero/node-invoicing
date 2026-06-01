# Invoicing App TODO

## Product foundation

## Billing correctness

- Add tax rate models and country-specific tax behavior.
- Add immutable invoice snapshots so issued invoices do not change if customer data changes later.
- Add currency handling rules for formatting, rounding, and storage.

## Documents and delivery

- Add print/PDF invoice templates.
- Add branded invoice themes using a dedicated print layout.
- Add email sending with delivery logging.
- Add downloadable PDF archives for invoices and receipts.

## Engineering

- Add Vitest unit tests for totals, numbering, and status transitions.
- Add Playwright coverage for customer/invoice creation flows.
- Add database seed data for local development.
- Add structured logging and request IDs.
- Add Docker Compose for PostgreSQL and local app services.
- Add linting and formatting.
