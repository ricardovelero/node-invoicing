# Organization Settings Service Design Document

## Purpose

The Settings Service manages editable organization-level settings used across the application, especially billing identity, address information, currency, and payment instructions.

It allows an authorized user to update the settings of the organization they are currently working in.

## Service Boundaries

The Settings Service owns:

- Updating organization billing settings
- Normalizing empty optional fields to `null`
- Persisting organization-level payment instructions
- Persisting organization-level currency preferences

The Settings Service does NOT own:

- User authentication
- User authorization
- Organization creation
- Organization membership management
- Role management
- Invoice creation
- Customer management
- UI rendering
- Flash messages

## Out of Scope

The service does NOT:

- Read HTTP requests or responses directly
- Decide whether the current user has permission to update settings
- Generate user-facing messages
- Validate raw form payloads directly
- Manage sessions
- Send emails
- Generate invoices or PDFs

## Domain Entities

- Organization

## Data Ownership

```txt
Organization
└── Settings fields
    ├── legalName
    ├── taxId
    ├── addressLine1
    ├── city
    ├── country
    ├── currency
    └── paymentInstructions
```

Organization settings belong directly to an organization. They do not belong to an individual user.

## Core Business Rules

- Settings can only be updated for the active organization.
- Optional empty string values should be stored as `null`.
- Currency must always have a valid value.
- Billing settings should be centralized in the Organization model.
- The service must not update settings for an organization outside the current user's authorized scope.

## Dependencies

The Settings Service depends on:

- Prisma Client
- Organization model
- Settings form schema

## Assumptions

- Authorization has already been checked before calling the service.
- The `organizationId` passed into the service belongs to the active organization context.
- Form data has already been validated before reaching the service.
- Optional fields may arrive as empty strings from HTML forms.
- Empty optional fields should be persisted as `null`, not as empty strings.

## Public Operations

### updateOrganizationSettings

Purpose:
Update editable settings for an organization.

Input:

- organizationId
- OrganizationSettingsForm

Rules:

- The organization must exist.
- The update must target only the provided organizationId.
- Optional empty string values must be converted to `null`.
- Currency must be persisted as a non-null value.
- The service should not decide whether the current user is allowed to update the organization.

Output:

Success:

- Updated Organization

Failure:

- organizationNotFound
- databaseError

## Helper Functions

### emptyToNull

Responsibility:
Convert empty string values from HTML forms into `null` before persistence.

Example:

```ts
emptyToNull(''); // null
emptyToNull('ACME Ltd'); // "ACME Ltd"
```

## Security Rules

- The service must always update by `organizationId`.
- The service must not accept a user-controlled organization ID unless authorization has already been checked.
- The controller or middleware must verify that the current user belongs to the organization before calling this service.
- Role checks should happen outside this service, likely in middleware or controller-level guards.

## Transaction Boundaries

The current settings update does not require an explicit database transaction because it updates a single Organization record.

A transaction may become necessary later if updating settings also affects:

- Billing profiles
- Invoice defaults
- Tax configuration
- Audit logs
- External payment provider configuration

## Error Cases

Possible failures:

- organizationNotFound
- invalidOrganizationContext
- databaseError

## Invariants

These conditions must always remain true:

- Organization settings belong to an organization, not to a user.
- Optional empty fields should be stored as `null`.
- Currency should never be stored as `null`.
- Settings updates must not cross organization boundaries.

## Future Considerations

Potential future features that may impact this service:

- Company logo and branding settings
- Invoice numbering preferences
- Default tax rates
- Default invoice notes
- Default payment terms
- Bank account details
- Multi-currency support
- Localization settings
- Audit trail for settings changes
