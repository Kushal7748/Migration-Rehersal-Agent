// ============================================================
// MIGR8 Append-Only Audit Service
// Records all transitions, model routing, approvals, token validations,
// and execution events into the control plane audit table.
// ============================================================

import { query } from "../../db/connection.js";
import { logger } from "../../observability/logger/index.js";
import type { ActorType } from "../../core/types/migration.js";

export interface AuditRecordInput {
  actorType: ActorType;
  actorId: string;
  action: string;
  migrationRequestId?: string;
  evidenceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export class AuditService {
  async record(event: AuditRecordInput): Promise<string> {
    try {
      const res = await query(
        `INSERT INTO audit_log (
          actor_type, actor_id, action, migration_request_id,
          evidence_id, metadata, ip_address
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id`,
        [
          event.actorType,
          event.actorId,
          event.action,
          event.migrationRequestId ?? null,
          event.evidenceId ?? null,
          JSON.stringify(event.metadata ?? {}),
          event.ipAddress ?? null,
        ]
      );
      return (res.rows[0] as { id: string }).id;
    } catch (err) {
      logger.error({ err, event }, "Failed to write audit log entry");
      throw err;
    }
  }

  async getMigrationHistory(migrationRequestId: string) {
    const res = await query(
      `SELECT * FROM audit_log
       WHERE migration_request_id = $1
       ORDER BY timestamp ASC`,
      [migrationRequestId]
    );
    return res.rows;
  }
}

export const auditService = new AuditService();
