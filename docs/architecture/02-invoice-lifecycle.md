# Invoice Lifecycle

```mermaid
stateDiagram-v2
  [*] --> DRAFT: create invoice

  DRAFT --> SENT: send\ncapture snapshot
  DRAFT --> VOID: void

  SENT --> PARTIALLY_PAID: recordPayment\npartial balance remains
  SENT --> OVERDUE: markOverdue
  SENT --> OVERDUE: recordPayment\npartial and past due
  SENT --> PAID: recordPayment\nbalance covered
  SENT --> VOID: void

  PARTIALLY_PAID --> PARTIALLY_PAID: recordPayment\npartial balance remains
  PARTIALLY_PAID --> OVERDUE: markOverdue
  PARTIALLY_PAID --> OVERDUE: recordPayment\npartial and past due
  PARTIALLY_PAID --> PAID: recordPayment\nbalance covered
  PARTIALLY_PAID --> VOID: void

  OVERDUE --> OVERDUE: recordPayment\npartial balance remains
  OVERDUE --> PAID: recordPayment\nbalance covered
  OVERDUE --> VOID: void

  PAID --> [*]
  VOID --> [*]
```

Notes:

- Only `DRAFT` invoices are editable.
- The `send` action is only allowed from `DRAFT` and captures an immutable `InvoiceSnapshot` before setting the invoice to `SENT`.
- Payments are only accepted for `SENT`, `PARTIALLY_PAID`, and `OVERDUE` invoices.
- Payment recording rejects overpayments and invoices whose existing payments already cover the total.
- `PAID` and `VOID` are terminal states with no further status actions.
