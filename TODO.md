# Invoicing App TODO

## Product foundation

- Add organization settings: legal name, address, tax ID, default currency, payment instructions.
- Scope customers and invoices by organization.
- Add CSRF protection for all form posts.
- Add invoice detail pages with status transitions: draft, sent, paid, overdue, void.
- Add editable multi-line invoice forms with discounts, tax rates, and notes.
- Add customer detail pages with invoice/payment history.

## Billing correctness

- Move invoice numbering to a transactional sequence table to avoid duplicate numbers under concurrent creates.
- Add tax rate models and country-specific tax behavior.
- Add payment allocation logic and partial payment support.
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
