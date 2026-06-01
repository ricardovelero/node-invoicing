# Invoice Service Design Document

## Purpose

The Invoice Service manages invoice lifecycle operations within an organization, including creation, status transitions, payment registration, and invoice retrieval.

## Service Boundaries

The Invoice Service owns:

- Invoice creation
- Invoice status transitions
- Payment registration
- Invoice balance calculations
- Invoice retrieval within an organization
- Capturing immutable invoice snapshots when an invoice is issued

The Invoice Service does NOT own:

- Customer management
- User permissions
- Organization management
- Email delivery
- PDF generation
- UI rendering

## Out of Scope

The service does NOT:

- Render views
- Handle HTTP requests or responses
- Manage sessions
- Generate UI messages
- Validate HTML forms directly

## Domain Entities

- Organization
- Customer
- Invoice
- InvoiceLine
- InvoiceSnapshot
- Payment

## Core Business Rules

- Every invoice belongs to exactly one organization.
- Every customer belongs to exactly one organization.
- Invoice numbers must be unique within an organization.
- Payments cannot exceed the outstanding balance.
- Archived customers cannot receive new invoices.
- Issued invoices must not change if customer or organization data changes later.
- Customer, seller, tax, and payment details used for an issued invoice must be captured as an immutable snapshot.

## Dependencies

The Invoice Service depends on:

- Prisma Client
- Invoice Numbering Service
- Money Calculation Utilities
- Customer Repository

## Data Ownership

```txt
Organization
├── Customers
└── Invoices
    ├── InvoiceLines
    └── Payments
```

Invoices may only reference customers belonging to the same organization.

## Assumptions

- All monetary values are stored in cents.
- Database timestamps are stored in UTC.
- Organization IDs are trusted only after authorization.
- Invoice status transitions are controlled exclusively by the service.
- Client-side totals are never trusted.
- Draft invoices may use live customer and organization data.
- Issued invoices must use snapshot data for official display and future PDF generation.

## Public Operations

### getInvoices

Purpose:
Return all invoices for an organization.

Input:

- organizationId

Output:

Success:

- Invoice[]

Rules:

- Only invoices belonging to the organization may be returned.

### createInvoice

Purpose:
Create a new invoice.

Input:

- organizationId
- customerId
- issueDate
- dueDate
- invoiceLines

Rules:

- Customer must exist.
- Customer must belong to the organization.
- Customer must not be archived.
- Totals must be calculated on the server.
- Invoice number must be generated automatically.
- Entire operation must be transactional.

Output:

Success:

- Invoice

Failure:

- customerNotFound
- customerArchived
- customerDoesNotBelongToOrganization

### updateInvoiceStatus

Purpose:
Transition an invoice to a new state.

Input:

- organizationId
- invoiceId
- action

Rules:

- When transitioning from `DRAFT` to `SENT`, the service must capture an immutable invoice snapshot.
- The snapshot should include customer billing details, organization billing details, payment instructions, currency, and tax-related values used at issue time.

Allowed Transitions:

DRAFT

- send
- void

SENT

- markOverdue
- void

PARTIALLY_PAID

- markOverdue
- void

OVERDUE

- void

PAID

- none

VOID

- none

Output:

Success:

- Updated Invoice

Failure:

- notFound
- invalidTransition

### captureInvoiceSnapshot

Purpose:
Capture the official billing data used by an invoice at the moment it is issued.

Input:

- organizationId
- invoiceId

Rules:

- Snapshot creation must happen when an invoice transitions from `DRAFT` to `SENT`.
- Snapshot data must be copied from the current Customer and Organization records.
- Snapshot data must not be recalculated from live Customer or Organization data after the invoice is issued.
- Official invoice views and PDFs must use snapshot data for issued invoices.
- Draft invoices may continue using live Customer and Organization data.

Output:

Success:

- Invoice snapshot data persisted on the invoice

Failure:

- notFound
- invalidStatus
- missingBillingData

### recordInvoicePayment

Purpose:
Register a payment against an invoice.

Input:

- organizationId
- invoiceId
- amount
- paymentDate

Rules:

- Invoice must belong to organization.
- Invoice must be payable.
- Payment cannot exceed outstanding balance.
- Invoice row must be locked during payment registration.
- Operation must be transactional.

Output:

Success:

- Payment
- Updated Invoice Status
- Outstanding Balance

Failure:

- notFound
- invalidStatus
- alreadyPaid
- overpayment

## Helper Functions

### calculatePaymentSummary

Responsibility:
Calculate paid amount and outstanding balance.

### isPastDueDate

Responsibility:
Determine whether a due date has passed.

### isEffectivelyOverdue

Responsibility:
Determine whether an invoice should be treated as overdue.

## Security Rules

- All queries must be scoped by organizationId.
- Users cannot access data from another organization.
- Customer ownership must always be verified.
- Invoice ownership must always be verified.

## Concurrency Rules

- Invoice numbering must be concurrency-safe.
- Payment registration must prevent race conditions.
- No two invoices within the same organization may receive the same invoice number.
- Concurrent payment requests must never produce a negative outstanding balance.

## Transaction Boundaries

The following operations must run inside a database transaction:

- Invoice creation
- Payment registration
- Invoice numbering
- Invoice snapshot capture when issuing an invoice

## Error Cases

Possible failures:

- notFound
- invalidTransition
- invalidStatus
- overpayment
- alreadyPaid
- missingBillingData

## Invariants

These conditions must always remain true:

- Invoice totals are stored in cents.
- Invoice numbers are unique within an organization.
- Paid invoices cannot receive additional payments.
- Void invoices cannot be modified.
- Outstanding balance cannot be negative.
- Issued invoices must remain historically accurate even if customer or organization records are edited later.
- Official issued invoice output must use snapshot data, not live relational data.

## Future Considerations

Potential future features that may impact this service:

- Credit notes
- Recurring invoices
- Multi-currency support
- Country-specific tax rules
- Snapshot schema versioning
- Invoice approval workflows
- Automatic payment reminders
- Partial invoice cancellation
