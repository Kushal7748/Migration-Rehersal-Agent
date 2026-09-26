// ============================================================
// MIGR8 Database Reset
// Resets control-plane tables and cleans up demo state
// Preserves credentials and environment configuration
// ============================================================

import "dotenv/config";
import { query } from "./connection.js";
import { logger } from "../observability/logger/index.js";

export async function resetDatabase() {
  logger.info("🔄 Resetting MIGR8 Control-Plane database...");

  // Truncate control-plane tables in reverse dependency order
  await query(`
    TRUNCATE TABLE
      verification_runs,
      audit_log,
      model_routing_log,
      approvals,
      evidence_fields,
      evidence_packs,
      rehearsal_statements,
      rehearsal_runs,
      migration_plan_checks,
      migration_plans,
      schema_snapshots,
      state_transition_log,
      migration_requests
    CASCADE;
  `);

  logger.info("✅ MIGR8 Control-Plane database reset completed");
}

if (process.argv[1]?.endsWith("reset.ts")) {
  resetDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Reset script failed");
      process.exit(1);
    });
}
