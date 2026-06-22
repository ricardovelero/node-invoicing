# Agent Guidelines

This repository is a TypeScript Express invoicing app with server-rendered Nunjucks views, Prisma/PostgreSQL persistence, and a small CSP-safe frontend bundle. Follow the patterns below when making changes.

## Project Shape

- App entry: `src/app.ts`; server boot: `src/server.ts`.
- Feature modules live under `src/modules/<feature>/`.
- Each feature should keep HTTP handlers in `*.controller.ts`, routing in `*.routes.ts`, validation in `*.schema.ts`, and database/business operations in `*.service.ts` when the feature needs one.
- Shared middleware lives in `src/middleware/`.
- Shared utilities live in `src/lib/`.
- Views are Nunjucks templates under `src/views/`.
- Source frontend assets live under `src/public/`; generated build assets go to ignored `public/assets/`.
- Prisma schema and migrations live under `prisma/`.

## Commands

- Install dependencies with `pnpm install`.
- Run development with `pnpm dev`.
- Build with `pnpm build`.
- Run tests with `pnpm test`.
- Generate Prisma client with `pnpm prisma:generate`.
- Create/apply local migrations with `pnpm prisma:migrate`.

Always run `pnpm test` for auth/session/validation changes. Run `pnpm build` for template, CSS, frontend, or TypeScript-only changes if `pnpm test` is not needed.

## Auth And Sessions

- Auth routes are mounted under `/auth`.
- Public auth pages:
  - `GET /auth/register`
  - `POST /auth/register`
  - `GET /auth/login`
  - `POST /auth/login`
  - `GET /auth/forgot-password`
  - `POST /auth/forgot-password`
  - `GET /auth/reset-password`
  - `POST /auth/reset-password`
  - `POST /auth/logout`
- Protected app routes are mounted after `requireAuth` in `src/app.ts`.
- Use `loadAuthContext` to populate `req.auth`, `res.locals.currentUser`, and `res.locals.currentOrganization`.
- Store `req.session.userId` and `req.session.organizationId` after register/login.
- Regenerate the session on register/login before assigning authenticated session data.
- Destroy the session and clear `invoice.sid` on logout.
- Never render password values back into HTML after validation failures.
- Password reset and password change flows should reuse existing auth schemas, services, session, flash, and template patterns where possible.
- Forgot-password responses must avoid leaking whether an email exists.
- Reset-password and change-password flows must validate password confirmation and never expose reset tokens or password values in rendered HTML.
- Treat password changes as sensitive auth/session changes; run `pnpm test` after modifying them.

## Validation

- Prefer Zod schemas for request validation.
- Put module validation in `*.schema.ts`, not inline in controllers, unless the validation is tiny and truly local.
- For invalid form submissions, render the same template with an error status instead of redirecting:
  - `422` for validation errors.
  - `409` for unique/conflict errors such as an existing email.
- Pass back `values` for safe non-sensitive fields and `errors` as field-specific arrays.
- Use flash messages for completed actions across redirects, not for ordinary field validation.

## Organization Scoping

- Customer, invoice, dashboard, and numbering queries must be scoped by `req.auth!.organization.id`.
- Do not create customers or invoices without an `organizationId`.
- When creating invoices, verify the selected customer belongs to the current organization.
- Invoice numbers are organization-scoped.

## Frontend And CSP

- Keep the CSP strict. Do not add `unsafe-eval`.
- Current script policy is `script-src 'self'`.
- Do not reintroduce default Alpine or any library that requires `new Function`, `eval`, or `AsyncFunction`.
- Use plain TypeScript in `src/public/js/app.ts` with `data-*` hooks for progressive behavior.
- Keep HTML-native validation attributes such as `required` as no-JS fallbacks.
- If JS takes over validation, set `form.noValidate = true` at runtime rather than hardcoding `novalidate` in the template.

## Templates And Forms

- Use Nunjucks templates under `src/views/pages/...`.
- Keep form field names aligned with Zod schema keys and controller expectations.
- Show field-level validation errors near the relevant input.
- Required user-facing labels should show an asterisk.
- Keep auth pages simple and centered.
- Use POST forms for state-changing actions such as logout; do not use GET links for mutations.

## Tests

- Tests use Node's built-in test runner against compiled files in `dist`.
- Test files live next to the code they cover as `*.test.ts`.
- Mock Prisma boundaries in unit tests rather than requiring a database for controller flow tests.
- Cover important session behavior for auth changes: regenerate, destroy, assigned ids, redirects, and field errors.

## Style

- Use TypeScript strict mode.
- Match nearby import and formatting style.
- Keep controllers focused on HTTP flow; move reusable validation and data access out.
- Before coding, state assumptions when the task is ambiguous, and ask only when the ambiguity can materially change the implementation.
- Prefer the smallest change that satisfies the request; do not add speculative features, generic abstractions, or configurability that was not requested.
- Every changed line should trace directly to the current task.
- Do not refactor adjacent code, rename concepts, reformat files, or clean up unrelated dead code unless explicitly asked.
- If an implementation starts growing beyond the requested scope, stop and simplify before continuing.
- For bug fixes, prefer a failing test or reproducible check first, then implement the smallest fix.
- For multi-step changes, define the verification path before editing: test, build, manual route check, or template render check as appropriate.
- Keep comments sparse and useful.
- Do not commit generated `dist/` or `public/assets/` files.
- Preserve unrelated user changes. Do not revert files outside the current task.
- Use Context7 whenever library/API documentation, configuration, installation instructions, or framework-specific implementations are needed.
- Prefer existing project patterns, architecture, and conventions over documentation examples.
- Documentation should inform implementation, not override established project structure or introduce alternative architectural patterns without a strong reason.
- Before introducing a new dependency, pattern, or architectural approach, check whether an equivalent solution already exists in the codebase and extend it when appropriate.

## Code Formatting Rules

- Use single quotes for strings: `'example'`
- Indent with 2 spaces
- Always use semicolons
- Add trailing commas in multiline arrays and objects
- Avoid unnecessary parentheses in `return` statements unless they improve clarity
- Keep line length under 100 characters
- Match nearby import and formatting style.
