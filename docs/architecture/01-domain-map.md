# Domain Map

```mermaid
erDiagram
  USER ||--o{ ORGANIZATION_MEMBERSHIP : has
  ORGANIZATION ||--o{ ORGANIZATION_MEMBERSHIP : has
  ORGANIZATION ||--o{ CUSTOMER : owns
  ORGANIZATION ||--o{ INVOICE : owns
  ORGANIZATION ||--o{ INVOICE_NUMBER_SEQUENCE : reserves
  CUSTOMER ||--o{ INVOICE : receives
  INVOICE ||--o{ INVOICE_LINE : contains
  INVOICE ||--o{ PAYMENT : records
  INVOICE ||--o| INVOICE_SNAPSHOT : captures

  USER {
    string id PK
    string email UK
    string name
    string passwordHash
  }

  ORGANIZATION {
    uuid id PK
    string name
    string currency
    string locale
    string paymentInstructions
  }

  ORGANIZATION_MEMBERSHIP {
    uuid id PK
    string userId FK
    uuid organizationId FK
    OrganizationRole role
  }

  CUSTOMER {
    uuid id PK
    uuid organizationId FK
    string name
    datetime archivedAt
  }

  INVOICE {
    uuid id PK
    uuid organizationId FK
    uuid customerId FK
    string number
    InvoiceStatus status
    string currency
    int totalCents
  }

  INVOICE_LINE {
    uuid id PK
    uuid invoiceId FK
    string description
    decimal quantity
    int unitPriceCents
    int totalCents
  }

  PAYMENT {
    uuid id PK
    uuid invoiceId FK
    int amountCents
    datetime paidAt
    string reference
  }

  INVOICE_SNAPSHOT {
    uuid invoiceId PK
    string customerName
    string sellerName
    string paymentInstructions
    int totalCents
  }

  INVOICE_NUMBER_SEQUENCE {
    uuid organizationId PK
    int year PK
    int nextValue
  }
```

Notes:

- Users belong to organizations through `OrganizationMembership`; the membership row stores the user's organization role.
- Customers, invoices, and invoice number sequences are scoped to an organization.
- An invoice belongs to one customer and one organization, has many lines and payments, and may have one immutable snapshot.
- `InvoiceSnapshot` is one-to-one with `Invoice` and uses `invoiceId` as its primary key.
