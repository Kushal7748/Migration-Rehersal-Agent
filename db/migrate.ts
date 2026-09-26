// ============================================================
// MIGR8 Migration Runner
// Applies all SQL migration files in order
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  console.log("Running MIGR8 control-plane database migrations...");

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = file.replace(".sql", "");
      const exists = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version]
      );

      if (exists.rows.length > 0) {
        console.log(`  ✓ ${version} (already applied)`);
        continue;
      }

      console.log(`  → Applying ${version}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version]
        );
        await client.query("COMMIT");
        console.log(`  ✓ ${version} applied`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${version} failed: ${err}`);
      }
    }

    console.log("✅ All migrations applied successfully");
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
