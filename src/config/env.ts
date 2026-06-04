import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me"),
  APP_URL: z.string().url().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  POSTMARK_FROM: z.string().optional(),
  POSTMARK_API_URL: z.string().url().default("https://api.postmarkapp.com/email"),
  POSTMARK_MESSAGE_STREAM: z.string().default("outbound"),
  POSTMARK_WEBHOOK_USERNAME: z.string().optional(),
  POSTMARK_WEBHOOK_PASSWORD: z.string().optional(),
});

export const env = envSchema.parse(process.env);
