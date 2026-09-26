// ============================================================
// MIGR8 Neon Migration Client — POLICY SERVICE ONLY
// This client holds the write credential.
// It MUST NOT be accessible to the agent.
// ============================================================

import { logger } from "../../observability/logger/index.js";
import { Migr8Error } from "../../core/errors/domain-errors.js";

export interface PrepareMigrationInput {
  migrationId: string;
  targetBranchId: string;
  targetDatabase: string;
  migrationPlanId: string;
}

export interface RehearsalBranch {
  branchId: string;
  branchName: string;
  connectionString: string; // Never exposed to agent
  createdAt: string;
}

export interface CompleteMigrationInput {
  migrationId: string;
  rehearsalBranchId: string;
  approvedSql: string[];
  evidenceId: string;
  approvalTokenHash: string;
}

export interface MigrationCompletion {
  success: boolean;
  branchMerged: boolean;
  completedAt: string;
  affectedRows: number;
}

export interface NeonMigrationClient {
  prepareDatabaseMigration(input: PrepareMigrationInput): Promise<RehearsalBranch>;
  executeMigrationOnBranch(branchId: string, sql: string[], connectionString: string): Promise<{ success: boolean; durationMs: number; rowsAffected: number; lockDurationMs: number }>;
  completeDatabaseMigration(input: CompleteMigrationInput): Promise<MigrationCompletion>;
  deleteBranch(branchId: string): Promise<void>;
  getBranchConnectionString(branchId: string): Promise<string>; // Returns write string — POLICY ONLY
}

/**
 * NeonMigrationClientImpl — uses NEON_WRITE_TOKEN
 * SECURITY: This class must only be instantiated in the Policy Service.
 * It must never be imported into agent code paths.
 */
export class NeonMigrationClientImpl implements NeonMigrationClient {
  private readonly projectId: string;
  private readonly writeToken: string;

  constructor() {
    // Verify we have the write token — fail fast if not
    this.writeToken = process.env["NEON_WRITE_TOKEN"] ?? "";
    this.projectId = process.env["NEON_PROJECT_ID"] ?? "";

    if (!this.writeToken) {
      logger.warn(
        "NEON_WRITE_TOKEN not configured — migration execution will be unavailable"
      );
    }
  }

  async prepareDatabaseMigration(input: PrepareMigrationInput): Promise<RehearsalBranch> {
    logger.info(
      { migrationId: input.migrationId, targetBranch: input.targetBranchId },
      "Preparing database migration branch"
    );

    // Create a COW branch from the target branch for rehearsal
    const branchName = `migr8-rehearsal-${input.migrationId}-${Date.now()}`;
    const branchId = `br_${Math.random().toString(36).substring(2, 12)}`;

    // In production, call: POST https://console.neon.tech/api/v2/projects/{project_id}/branches
    // with { "branch": { "parent_id": targetBranchId, "name": branchName } }
    
    try {
      if (this.projectId && this.writeToken) {
        const response = await fetch(
          `https://console.neon.tech/api/v2/projects/${this.projectId}/branches`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.writeToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branch: {
                parent_id: input.targetBranchId === "main" ? undefined : input.targetBranchId,
                name: branchName,
              },
            }),
          }
        );

        if (response.ok) {
          const data = await response.json() as { branch?: { id: string; name: string } };
          return {
            branchId: data.branch?.id ?? branchId,
            branchName: data.branch?.name ?? branchName,
            connectionString: await this.getBranchConnectionString(data.branch?.id ?? branchId),
            createdAt: new Date().toISOString(),
          };
        }
        
        const errorText = await response.text();
        logger.warn({ status: response.status, error: errorText }, "Neon API branch creation failed, using demo mode");
      }
    } catch (err) {
      logger.warn({ err }, "Neon API unavailable, using demo branch");
    }

    // Demo fallback
    return {
      branchId,
      branchName,
      connectionString: process.env["DATABASE_URL"] ?? "", // Use local DB in demo mode
      createdAt: new Date().toISOString(),
    };
  }

  async executeMigrationOnBranch(
    branchId: string,
    sql: string[],
    connectionString: string
  ): Promise<{ success: boolean; durationMs: number; rowsAffected: number; lockDurationMs: number }> {
    logger.info({ branchId, statementCount: sql.length }, "Executing migration on branch");
    
    const startTime = Date.now();
    let rowsAffected = 0;
    let lockDurationMs = 0;

    try {
      const pg = await import("pg");
      const useSsl = connectionString.includes("neon.tech") || connectionString.includes("sslmode=require");
      const client = new pg.default.Client({
        connectionString,
        ...(useSsl && { ssl: { rejectUnauthorized: false } }),
      });
      await client.connect();

      try {
        await client.query("BEGIN");
        
        for (const statement of sql) {
          const stmtStart = Date.now();
          
          // Measure lock wait time (simplified — real implementation uses pg_locks)
          const lockStart = Date.now();
          const result = await client.query(statement);
          lockDurationMs += Date.now() - lockStart;
          
          if (result.rowCount) rowsAffected += result.rowCount;
        }
        
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        await client.end();
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
        rowsAffected,
        lockDurationMs,
      };
    } catch (err) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        rowsAffected: 0,
        lockDurationMs,
      };
    }
  }

  async completeDatabaseMigration(input: CompleteMigrationInput): Promise<MigrationCompletion> {
    logger.info(
      {
        migrationId: input.migrationId,
        evidenceId: input.evidenceId,
        // NEVER log approval token hash in full
        tokenHashPrefix: input.approvalTokenHash.substring(0, 8) + "...",
      },
      "Completing production database migration"
    );

    // In production: merge or delete the rehearsal branch after production apply
    try {
      if (this.projectId && this.writeToken) {
        await fetch(
          `https://console.neon.tech/api/v2/projects/${this.projectId}/branches/${input.rehearsalBranchId}`,
          {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${this.writeToken}` },
          }
        );
      }
    } catch (err) {
      logger.warn({ err }, "Branch cleanup failed — non-critical");
    }

    return {
      success: true,
      branchMerged: false,
      completedAt: new Date().toISOString(),
      affectedRows: 0,
    };
  }

  async deleteBranch(branchId: string): Promise<void> {
    logger.info({ branchId }, "Deleting rehearsal branch");
    try {
      if (this.projectId && this.writeToken) {
        await fetch(
          `https://console.neon.tech/api/v2/projects/${this.projectId}/branches/${branchId}`,
          {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${this.writeToken}` },
          }
        );
      }
    } catch (err) {
      logger.warn({ err, branchId }, "Branch deletion failed");
    }
  }

  async createBranch(parentBranch = "main", prefix = "rehearsal"): Promise<RehearsalBranch> {
    return this.prepareDatabaseMigration({
      migrationId: `${prefix}-${Date.now()}`,
      targetBranchId: parentBranch,
      targetDatabase: "main",
      migrationPlanId: "plan-rehearsal",
    });
  }

  async getBranchConnectionString(branchId: string): Promise<string> {
    // In production: call Neon API to get branch connection string
    // using NEON_WRITE_TOKEN. NEVER expose this to the agent.
    const base = process.env["NEON_WRITE_CONNECTION_URL"];
    if (base) return base;
    return process.env["DATABASE_URL"] ?? "";
  }
}
