import { spawnSync } from "node:child_process";

const defaultDatabaseUrl = "postgresql://test:test@localhost:5432/test";
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? defaultDatabaseUrl;
const port = process.env.E2E_PORT ?? process.env.PORT ?? "4173";
const sessionSecret =
  process.env.SESSION_SECRET ?? "test-session-secret-change-me";

const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {
    env: {
      ...process.env,
      ...env,
    },
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const testEnv = {
  DATABASE_URL: databaseUrl,
  TEST_DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  PORT: port,
  SESSION_SECRET: sessionSecret,
};

run("pnpm", ["build"]);
run("pnpm", ["exec", "prisma", "migrate", "deploy"], testEnv);
run("pnpm", ["exec", "playwright", "test"], testEnv);
