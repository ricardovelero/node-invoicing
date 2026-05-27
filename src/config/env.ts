import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me"),
});

export const env = envSchema.parse(process.env);
