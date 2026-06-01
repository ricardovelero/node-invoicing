# Auth Service Design Document

## Purpose

The Auth Service manages authentication business logic for the application.

It is responsible for registering users, creating their initial organization, creating the initial organization membership, and validating login credentials.

## Service Boundaries

The Auth Service owns:

- User registration
- Password hashing
- Password verification
- Initial organization creation during registration
- Initial organization membership creation during registration
- Login credential validation
- Selecting the initial active organization after login

The Auth Service does NOT own:

- HTTP requests or responses
- Express sessions
- Flash messages
- Redirects
- View rendering
- Route protection middleware
- Role-based authorization checks
- Password reset email delivery
- Organization settings management

## Out of Scope

The service does NOT:

- Read `req.body` directly
- Write to `req.session` directly
- Call `req.flash`
- Render login or register pages
- Decide which URL to redirect to
- Protect routes
- Check whether a user has a specific role for an organization

## Domain Entities

- User
- Organization
- OrganizationMembership

## Data Ownership

```txt
User
└── OrganizationMemberships
    └── Organization
```

A user may belong to multiple organizations.

An organization may have multiple users through memberships.

The role belongs to the membership, not directly to the user.

## Core Business Rules

- A registered user must have a unique email address.
- User emails must be normalized before persistence.
- Passwords must never be stored in plain text.
- Registration must create exactly one initial organization.
- Registration must create one membership between the user and the organization.
- The first membership created during registration must have the `OWNER` role.
- Registration must be transactional.
- Login must not reveal whether the email or password was incorrect.
- Login must return an active organization context.

## Dependencies

The Auth Service depends on:

- Prisma Client
- User model
- Organization model
- OrganizationMembership model
- Password hashing library, for example `bcryptjs`
- Auth form schemas or already validated DTOs

## Assumptions

- Form payloads are validated before reaching the service.
- Email addresses are case-insensitive for login purposes.
- A user can belong to more than one organization.
- The active organization is selected from the user's memberships.
- Session creation happens outside the service.
- Flash messages happen outside the service.
- Authorization middleware handles protected routes after login.

## Public Operations

### registerUser

Purpose:
Create a new user, their first organization, and their owner membership.

Input:

- name
- email
- password
- organizationName

Rules:

- Email must be normalized using lowercase and trim.
- Password must be hashed before saving.
- User must be created with the hashed password.
- Organization must be created during the same transaction.
- OrganizationMembership must be created during the same transaction.
- Membership role must be `OWNER`.
- If any step fails, the whole registration must roll back.
- Duplicate email errors must be converted into a domain-level failure.

Output:

Success:

- userId
- organizationId

Failure:

- emailAlreadyExists
- databaseError

### authenticateUser

Purpose:
Validate login credentials and return the user's active organization context.

Input:

- email
- password

Rules:

- Email must be normalized before lookup.
- If the user does not exist, return `invalidCredentials`.
- If the password does not match, return `invalidCredentials`.
- The service must not reveal whether the email or password failed.
- The service must return one active organization ID from the user's memberships.
- If the user has no organization membership, return `noOrganizationMembership`.

Output:

Success:

- userId
- organizationId

Failure:

- invalidCredentials
- noOrganizationMembership
- databaseError

### getInitialOrganizationForUser

Purpose:
Return the first available organization context for an authenticated user.

Input:

- userId

Rules:

- User must have at least one organization membership.
- If multiple memberships exist, choose a deterministic default.
- The current default strategy is to choose the oldest membership.

Output:

Success:

- organizationId
- role

Failure:

- noOrganizationMembership
- userNotFound

## Helper Functions

### normalizeEmail

Responsibility:
Normalize an email address before storing or comparing it.

Example:

```ts
normalizeEmail('  USER@Example.COM '); // "user@example.com"
```

### hashPassword

Responsibility:
Hash a plain text password before persistence.

### verifyPassword

Responsibility:
Compare a plain text password against a stored password hash.

## Security Rules

- Passwords must never be stored in plain text.
- Password hashes must never be returned to controllers.
- Login failures must use a generic `invalidCredentials` result.
- Session regeneration must happen in the controller after successful login or registration.
- The service must not trust organization IDs coming from user-controlled form data during registration.
- Role checks must happen outside the Auth Service.

## Transaction Boundaries

The following operations must run inside a database transaction:

- User registration
- Initial organization creation
- Initial organization membership creation

Login does not require an explicit transaction because it only reads user and membership records.

## Error Cases

Possible failures:

- emailAlreadyExists
- invalidCredentials
- noOrganizationMembership
- userNotFound
- databaseError

## Invariants

These conditions must always remain true:

- Every registered user has a hashed password.
- A newly registered user has one initial organization.
- A newly registered user is the `OWNER` of their initial organization.
- A user's role is defined by OrganizationMembership.
- Login never exposes whether the email or password was wrong.
- The Auth Service never writes directly to Express session state.

## Future Considerations

Potential future features that may impact this service:

- Email verification
- Forgot password flow
- Password reset tokens
- Magic login links
- Two-factor authentication
- Organization invitations
- Switching active organization
- Remember-me sessions
- Account lockout after repeated failed login attempts
- Audit logs for login and registration events
