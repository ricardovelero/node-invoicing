import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 4173);
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://test:test@localhost:5432/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const postmarkApiUrl =
  process.env.POSTMARK_API_URL ?? "http://127.0.0.1:4181/email";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      APP_URL: baseURL,
      NODE_ENV: "test",
      PORT: String(port),
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? "test-session-secret-change-me",
      POSTMARK_SERVER_TOKEN:
        process.env.POSTMARK_SERVER_TOKEN ?? "test-postmark-token",
      POSTMARK_FROM:
        process.env.POSTMARK_FROM ?? "SaaS Billing <billing@example.test>",
      POSTMARK_API_URL: postmarkApiUrl,
      POSTMARK_MESSAGE_STREAM:
        process.env.POSTMARK_MESSAGE_STREAM ?? "outbound",
      POSTMARK_WEBHOOK_USERNAME:
        process.env.POSTMARK_WEBHOOK_USERNAME ?? "postmark",
      POSTMARK_WEBHOOK_PASSWORD:
        process.env.POSTMARK_WEBHOOK_PASSWORD ?? "postmark-secret",
    },
  },
});
