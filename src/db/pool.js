import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { config } from "../config.js";
import { logger } from "../logger.js";

// BIGINT(int8) は精度を落とさないため文字列で受け取る(pg既定)。
// TIMESTAMPTZ は Date のままで良い。

function sslOptionFor(connectionString, forced) {
  // DATABASE_SSL を明示した場合はそれに従う
  if (forced === true) {
    return { rejectUnauthorized: false };
  }

  if (forced === false) {
    return undefined;
  }

  if (/[?&]sslmode=(require|verify-ca|verify-full)/.test(connectionString)) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslOptionFor(config.DATABASE_URL, config.DATABASE_SSL),
  max: 10,
  idleTimeoutMillis: 30_000
});

pool.on("error", (error) => {
  logger.error("postgres pool error", error);
});

/** トランザクション実行ヘルパー */
export async function withTransaction(fn) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ロールバック失敗は元のエラーを優先する
    }
    throw error;
  } finally {
    client.release();
  }
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);

    if (applied.rowCount > 0) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });

    logger.info(`migration applied: ${file}`);
  }
}
