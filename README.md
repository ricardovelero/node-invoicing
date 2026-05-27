# Node Invoicing

A small invoicing application built with Node.js, Express, TypeScript, Prisma, PostgreSQL, Nunjucks, and Tailwind CSS.

The app is currently focused on the foundation for a multi-organization invoicing workflow:

- User registration, login, logout, and session-based auth.
- Organization ownership through memberships.
- Organization-scoped dashboard metrics.
- Organization-scoped customers and invoices.
- Server-rendered pages with progressive client-side enhancements.
- Strict Content Security Policy without `unsafe-eval`.

## Tech Stack

- Runtime: Node.js
- Package manager: pnpm
- Server: Express 5
- Views: Nunjucks
- Database: PostgreSQL
- ORM: Prisma
- Styling: Tailwind CSS
- Frontend bundle: esbuild + small TypeScript enhancements
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
PORT=3000
SESSION_SECRET="replace-this-in-production"
NODE_ENV="development"
```

Run Prisma migrations:

```sh
pnpm prisma:migrate
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

Builds the project and runs compiled `*.test.js` files with Node's built-in test runner.

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

After authentication, app data is scoped to the active organization.

## Validation And Forms

Form validation uses Zod on the server. Invalid submissions re-render the same template with field-specific errors and safe submitted values.

For example, register validation checks:

- email is present and valid
- password is present and strong
- organization name is present

Passwords are never rendered back into forms after validation failures.

Flash messages are used for completed actions across redirects. Field-level validation errors should use direct `422`/`409` renders instead of flash messages.

## Frontend Behavior

The frontend bundle is intentionally small and CSP-safe. It uses plain TypeScript and `data-*` hooks for:

- invoice total calculation
- flash message auto-dismiss
- register form inline validation
- password visibility toggle

The app does not use Alpine because the default Alpine runtime requires dynamic evaluation, which conflicts with the strict CSP.

## Security Notes

- Helmet sets security headers.
- Scripts are restricted to `script-src 'self'`.
- Session cookies are HTTP-only, `sameSite: "lax"`, and secure in production.
- Sessions are regenerated on login/register to reduce session fixation risk.
- Passwords are hashed with bcrypt before storage.

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
  public/
    assets/
    css/
    js/
  views/
prisma/
  schema.prisma
  migrations/
```

## Development Notes

- Keep generated files out of Git: `dist/` and `public/assets/` are ignored.
- Keep source assets under `src/public/`.
- Put new feature validation in `*.schema.ts`.
- Keep database access in services when behavior grows beyond a small controller.
- Scope organization-owned data by `req.auth!.organization.id`.
- Run `pnpm test` before committing auth/session/validation changes.

## Roadmap

See `TODO.md` for product and engineering follow-ups.

## License

MIT.
