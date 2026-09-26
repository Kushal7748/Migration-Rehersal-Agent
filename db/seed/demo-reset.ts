// ============================================================
// MIGR8 Demo Reset Script
// One command makes the entire system ready for a clean live demo:
// 1. Cleans up control plane records
// 2. Restores baseline users table (removes fraud_score if added)
// 3. Resets mock/demo state
// ============================================================

import "dotenv/config";
import { query } from "../connection.js";
import { resetDatabase } from "../reset.js";
import { seedDatabase } from "./seed.js";
import { logger } from "../../observability/logger/index.js";

export async function demoReset() {
  logger.info("🎬 Starting MIGR8 Demo Reset...");

  // 1. Reset control plane
  await resetDatabase();

  // 2. Remove any migration columns from target tables if present
  try {
    await query(`
      ALTER TABLE users DROP COLUMN IF EXISTS fraud_score;
      ALTER TABLE users DROP COLUMN IF EXISTS risk_rating;
      DROP INDEX IF EXISTS idx_users_fraud_score;
    `);
    logger.info("Baseline schema restored (removed transient demo columns)");
  } catch (err) {
    logger.warn({ err }, "Schema restoration notice");
  }

  // 3. Ensure seed data exists
  await seedDatabase();

  logger.info("✨ Demo environment is 100% ready for MIGR8 rehearsal walkthrough!");
}

if (process.argv[1]?.endsWith("demo-reset.ts")) {
  demoReset()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Demo reset failed");
      process.exit(1);
    });
}
