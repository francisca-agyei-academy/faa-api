import "dotenv/config";
import { z } from "zod";

// `KEY=` in .env arrives as "", which should mean "not set".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Access tokens are short-lived; the refresh cookie keeps the user logged in.
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Refresh cookie. Defaults suit localhost (frontend :3000, API :4000 count as the same site).
  // With a real domain, serve the API from a subdomain (api.example.com) and keep SameSite=lax.
  COOKIE_SECURE: optional(z.stringbool()),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: optional(z.string()),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Human-readable logs. Defaults to on, except in production (where logs are JSON, one per line).
  LOG_PRETTY: optional(z.stringbool()),

  // Serve Swagger UI at /docs. Defaults to on, except in production.
  ENABLE_DOCS: z.stringbool().optional(),

  // Frontend base URL; email links point at its /verify-email and /reset-password pages.
  APP_URL: z.url().default("http://localhost:3000"),

  // Gmail SMTP. Needs 2-Step Verification and an App Password (not the account password).
  // Without them, outside production, emails are printed to the console instead of sent.
  GMAIL_USER: optional(z.email()),
  // Google shows App Passwords as "abcd efgh ijkl mnop"; the spaces are not part of it.
  GMAIL_APP_PASSWORD: optional(z.string().transform((value) => value.replace(/\s+/g, ""))),
  EMAIL_FROM: optional(z.string()),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && (!value.GMAIL_USER || !value.GMAIL_APP_PASSWORD)) {
    ctx.addIssue({ code: "custom", path: ["GMAIL_USER"], message: "GMAIL_USER and GMAIL_APP_PASSWORD are required in production" });
  }
  const secure = value.COOKIE_SECURE ?? value.NODE_ENV === "production";
  if (value.COOKIE_SAMESITE === "none" && !secure) {
    ctx.addIssue({ code: "custom", path: ["COOKIE_SAMESITE"], message: "COOKIE_SAMESITE=none requires COOKIE_SECURE=true" });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const docsEnabled = env.ENABLE_DOCS ?? !isProduction;
