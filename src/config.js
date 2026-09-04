import { z } from "zod";

const booleanish = z
  .string()
  .optional()
  .transform((value) => (value ?? "true").toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0"]))
  .transform((value) => value === "true" || value === "1");

const snowflake = z.string().regex(/^\d{17,20}$/, "must be a Discord snowflake");

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: snowflake,
  DISCORD_DEV_GUILD_ID: snowflake.optional(),

  DATABASE_URL: z.string().min(1),
  // 未設定の場合は DATABASE_URL の sslmode から判断する
  DATABASE_SSL: booleanish.optional(),

  LEVEL_UP_NOTIFY: booleanish,
  LEVEL_UP_CHANNEL_ID: snowflake.optional(),

  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

function emptyToUndefined(env) {
  const out = {};

  for (const [key, value] of Object.entries(env)) {
    out[key] = value === "" ? undefined : value;
  }

  return out;
}

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(emptyToUndefined(env));

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return Object.freeze(parsed.data);
}

export const config = loadConfig();
