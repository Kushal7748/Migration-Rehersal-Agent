// ============================================================
// MIGR8 Migration Routes — /api/v1/migrations
// Every mutation validates state, idempotency, and authorization.
// The /execute endpoint NEVER trusts client input for security decisions.
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { query, withTransaction } from "../../db/connection.js";
import { authenticateRequest, requireRole } from "../middleware/auth.js";
import { runFullWorkflow, runDiscovery, runPlanAndCritique, runRehearsalAndRisk, buildEvidence } from "../../agent/orchestration/workflow.js";
import { executeProductionMigration } from "../../policy/execution/index.js";
import { mintApprovalToken } from "../../policy/approval-token/index.js";
import { Migr8Error } from "../../core/errors/domain-errors.js";
import { logger } from "../../observability/logger/index.js";
import { v4 as uuidv4 } from "uuid";

const CreateMigrationSchema = z.object({
  request_text: z.string().min(10).max(2000),
  target_database: z.string().min(1).max(255),
  target_branch: z.string().default("main"),
  target_table: z.string().optional(),
  idempotency_key: z.string().optional(),
});

const ApproveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().optional(),
});

const ExecuteSchema = z.object({
  approval_token: z.string().min(10),
});

export async function migrationRoutes(fastify: FastifyInstance) {
  // ── POST /migrations ──────────────────────────────────────────────────────
  fastify.post("/migrations", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreateMigrationSchema.parse(request.body);
      const user = request.user!;

      // Idempotency check
      if (body.idempotency_key) {
        const existing = await query(
          "SELECT migration_request_id, response FROM idempotency_keys WHERE key = $1",
          [body.idempotency_key]
        );
        if (existing.rows.length > 0) {
          const row = existing.rows[0] as { response: unknown };
          return reply.status(200).send(row.response);
        }
      }

      const migrationId = uuidv4();

      const result = await withTransaction(async (client) => {
        const migResult = await client.query(
          `INSERT INTO migration_requests (
            id, created_by, request_text, target_database, target_branch, target_table, idempotency_key
          ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [migrationId, user.id, body.request_text, body.target_database, body.target_branch,
           body.target_table ?? null, body.idempotency_key ?? null]
        );

        await client.query(
          `INSERT INTO audit_log (actor_type, actor_id, action, migration_request_id, metadata)
           VALUES ($1,$2,$3,$4,$5)`,
          ["HUMAN", user.id, "MIGRATION_REQUEST_CREATED", migrationId,
           JSON.stringify({ targetDatabase: body.target_database, targetTable: body.target_table })]
        );

        return migResult.rows[0];
      });

      const response = { data: result };

      // Store idempotency response
      if (body.idempotency_key) {
        await query(
          "INSERT INTO idempotency_keys (key, migration_request_id, response) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING",
          [body.idempotency_key, migrationId, JSON.stringify(response)]
        );
      }

      return reply.status(201).send(response);
    },
  });

  // ── GET /migrations ───────────────────────────────────────────────────────
  fastify.get("/migrations", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const qs = request.query as { limit?: string; offset?: string; status?: string };
      const limit = Math.min(parseInt(qs.limit ?? "20"), 100);
      const offset = parseInt(qs.offset ?? "0");

      const result = await query(
        `SELECT * FROM migration_requests
         WHERE ($1::text IS NULL OR status = $1::migration_state)
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [qs.status ?? null, limit, offset]
      );

      return reply.send({ data: result.rows });
    },
  });

  // ── GET /migrations/:id ───────────────────────────────────────────────────
  fastify.get("/migrations/:id", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await query("SELECT * FROM migration_requests WHERE id = $1", [id]);
      if (result.rows.length === 0) return reply.status(404).send({ error: { code: "MIGRATION_NOT_FOUND" } });
      return reply.send({ data: result.rows[0] });
    },
  });

  // ── POST /migrations/:id/discover ─────────────────────────────────────────
  fastify.post("/migrations/:id/discover", {
    preHandler: [authenticateRequest, requireRole("OPERATOR", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const result = await runDiscovery({ migrationRequestId: id, userId: user.id });
      return reply.send({ data: result });
    },
  });

  // ── POST /migrations/:id/plan ─────────────────────────────────────────────
  fastify.post("/migrations/:id/plan", {
    preHandler: [authenticateRequest, requireRole("OPERATOR", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const result = await runPlanAndCritique({ migrationRequestId: id, userId: user.id });
      return reply.send({ data: result });
    },
  });

  // ── POST /migrations/:id/rehearse ─────────────────────────────────────────
  fastify.post("/migrations/:id/rehearse", {
    preHandler: [authenticateRequest, requireRole("OPERATOR", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const body = (request.body ?? {}) as { plan_id?: string };

      // Load latest plan if not specified
      let planId = body.plan_id;
      if (!planId) {
        const planResult = await query(
          "SELECT id FROM migration_plans WHERE migration_request_id = $1 ORDER BY version DESC LIMIT 1",
          [id]
        );
        if (planResult.rows.length === 0) {
          return reply.status(422).send({ error: { code: "MIGRATION_PLAN_NOT_FOUND" } });
        }
        planId = (planResult.rows[0] as { id: string }).id;
      }

      const result = await runRehearsalAndRisk({ migrationRequestId: id, userId: user.id }, planId);
      return reply.send({ data: result });
    },
  });

  // ── POST /migrations/:id/build-evidence ──────────────────────────────────
  fastify.post("/migrations/:id/build-evidence", {
    preHandler: [authenticateRequest, requireRole("OPERATOR", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const body = (request.body ?? {}) as { plan_id?: string; rehearsal_run_id?: string };

      // Resolve from DB, not trusting client entirely
      let planId = body.plan_id;
      let rehearsalId = body.rehearsal_run_id;

      if (!planId) {
        const r = await query(
          "SELECT id FROM migration_plans WHERE migration_request_id = $1 ORDER BY version DESC LIMIT 1",
          [id]
        );
        planId = (r.rows[0] as { id: string })?.id;
      }

      if (!rehearsalId) {
        const r = await query(
          "SELECT id FROM rehearsal_runs WHERE migration_request_id = $1 ORDER BY started_at DESC LIMIT 1",
          [id]
        );
        rehearsalId = (r.rows[0] as { id: string })?.id;
      }

      if (!planId || !rehearsalId) {
        return reply.status(422).send({ error: { code: "EVIDENCE_NOT_FOUND", message: "No plan or rehearsal found" } });
      }

      const result = await buildEvidence({ migrationRequestId: id, userId: user.id }, planId, rehearsalId);
      return reply.send({ data: result });
    },
  });

  // ── POST /migrations/:id/approve ─────────────────────────────────────────
  // Human approval — creates a cryptographically signed token
  fastify.post("/migrations/:id/approve", {
    preHandler: [authenticateRequest, requireRole("APPROVER", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const body = ApproveSchema.parse(request.body);

      // Load migration and evidence from server-side state
      const migration = await query("SELECT * FROM migration_requests WHERE id = $1", [id]);
      if (migration.rows.length === 0) {
        return reply.status(404).send({ error: { code: "MIGRATION_NOT_FOUND" } });
      }

      const migRow = migration.rows[0] as Record<string, unknown>;
      const allowedStates = ["EVIDENCE_READY", "AWAITING_APPROVAL"];
      if (!allowedStates.includes(migRow["status"] as string)) {
        return reply.status(409).send({
          error: {
            code: "INVALID_STATE_TRANSITION",
            message: `Migration is in state ${migRow["status"]}, expected EVIDENCE_READY or AWAITING_APPROVAL`,
          },
        });
      }

      const evidence = await query(
        "SELECT * FROM evidence_packs WHERE migration_request_id = $1 AND is_stale = FALSE ORDER BY created_at DESC LIMIT 1",
        [id]
      );

      if (evidence.rows.length === 0) {
        return reply.status(422).send({ error: { code: "EVIDENCE_NOT_FOUND" } });
      }

      const evidenceRow = evidence.rows[0] as Record<string, unknown>;

      // Mint approval token
      const minted = mintApprovalToken(
        evidenceRow["evidence_id"] as string,
        id,
        user.id,
        body.action
      );

      // Store approval record
      await withTransaction(async (client) => {
        // Invalidate any existing active approvals for this migration
        await client.query(
          "UPDATE approvals SET used = TRUE WHERE migration_request_id = $1 AND used = FALSE",
          [id]
        );

        await client.query(
          `INSERT INTO approvals (
            evidence_id, migration_request_id, approver_id, action,
            expires_at, token_hash, nonce, request_context
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            evidenceRow["evidence_id"],
            id,
            user.id,
            body.action,
            minted.expiresAt,
            minted.tokenHash,
            minted.nonce,
            JSON.stringify({
              ip: request.ip,
              userAgent: request.headers["user-agent"] ?? "unknown",
              reason: body.reason,
            }),
          ]
        );

        await client.query(
          `INSERT INTO audit_log (actor_type, actor_id, action, migration_request_id, evidence_id, metadata, ip_address)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          ["HUMAN", user.id, body.action === "APPROVE" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
           id, evidenceRow["evidence_id"] as string,
           JSON.stringify({ reason: body.reason }), request.ip]
        );

        if (body.action === "APPROVE") {
          await client.query(
            "UPDATE migration_requests SET status = 'APPROVED', updated_at = NOW() WHERE id = $1",
            [id]
          );
        } else {
          await client.query(
            "UPDATE migration_requests SET status = 'REJECTED', updated_at = NOW() WHERE id = $1",
            [id]
          );
        }
      });

      return reply.send({
        data: {
          action: body.action,
          approvalToken: body.action === "APPROVE" ? minted.token : null,
          expiresAt: minted.expiresAt,
          evidenceId: evidenceRow["evidence_id"],
          message: body.action === "APPROVE"
            ? "Approval token issued. Use this token with /execute within the TTL."
            : "Migration rejected.",
        },
      });
    },
  });

  // ── POST /migrations/:id/execute ─────────────────────────────────────────
  // Production execution — validated by Policy Service.
  // NEVER trusts client-provided SQL, evidence ID, or risk status.
  fastify.post("/migrations/:id/execute", {
    preHandler: [authenticateRequest, requireRole("APPROVER", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const body = ExecuteSchema.parse(request.body);

      try {
        const result = await executeProductionMigration({
          migrationRequestId: id,
          approvalToken: body.approval_token,
          approverId: user.id,
          requestIp: request.ip,
          userAgent: request.headers["user-agent"],
        });

        return reply.send({ data: result });
      } catch (err) {
        if (err instanceof Migr8Error) {
          return reply.status(err.httpStatus).send(err.toJSON());
        }
        throw err;
      }
    },
  });

  // ── GET /migrations/:id/plans ─────────────────────────────────────────────
  fastify.get("/migrations/:id/plans", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await query(
        "SELECT mp.*, mpc.* FROM migration_plans mp LEFT JOIN migration_plan_checks mpc ON mp.id = mpc.migration_plan_id WHERE mp.migration_request_id = $1 ORDER BY mp.version DESC",
        [id]
      );
      return reply.send({ data: result.rows });
    },
  });

  // ── GET /migrations/:id/rehearsals ────────────────────────────────────────
  fastify.get("/migrations/:id/rehearsals", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await query(
        "SELECT * FROM rehearsal_runs WHERE migration_request_id = $1 ORDER BY started_at DESC",
        [id]
      );
      return reply.send({ data: result.rows });
    },
  });

  // ── GET /migrations/:id/evidence ──────────────────────────────────────────
  fastify.get("/migrations/:id/evidence", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await query(
        "SELECT ep.*, array_agg(json_build_object('path', ef.field_path, 'value', ef.value, 'provenance', ef.provenance, 'source', ef.source)) as fields FROM evidence_packs ep LEFT JOIN evidence_fields ef ON ep.id = ef.evidence_pack_id WHERE ep.migration_request_id = $1 GROUP BY ep.id ORDER BY ep.created_at DESC LIMIT 1",
        [id]
      );
      return reply.send({ data: result.rows[0] ?? null });
    },
  });

  // ── GET /migrations/:id/audit ─────────────────────────────────────────────
  fastify.get("/migrations/:id/audit", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await query(
        "SELECT * FROM audit_log WHERE migration_request_id = $1 ORDER BY timestamp DESC",
        [id]
      );
      return reply.send({ data: result.rows });
    },
  });

  // ── GET /migrations/:id/trace ─────────────────────────────────────────────
  fastify.get("/migrations/:id/trace", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const transitions = await query(
        "SELECT * FROM state_transition_log WHERE migration_request_id = $1 ORDER BY timestamp ASC",
        [id]
      );
      const routingLogs = await query(
        "SELECT * FROM model_routing_log WHERE migration_request_id = $1 ORDER BY created_at ASC",
        [id]
      );
      return reply.send({
        data: {
          stateTransitions: transitions.rows,
          modelRoutingLog: routingLogs.rows,
        },
      });
    },
  });

  // ── GET /migrations/:id/verification ─────────────────────────────────────
  fastify.get("/migrations/:id/verification", {
    preHandler: [authenticateRequest],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await query(
        "SELECT * FROM verification_runs WHERE migration_request_id = $1 ORDER BY created_at DESC LIMIT 1",
        [id]
      );
      return reply.send({ data: result.rows[0] ?? null });
    },
  });

  // ── POST /migrations/:id/run-workflow ─────────────────────────────────────
  // Runs the full automated workflow (for demo/testing)
  fastify.post("/migrations/:id/run-workflow", {
    preHandler: [authenticateRequest, requireRole("OPERATOR", "ADMIN")],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      // Run workflow in background
      setImmediate(async () => {
        try {
          await runFullWorkflow({ migrationRequestId: id, userId: user.id });
        } catch (err) {
          logger.error({ err, migrationId: id }, "Background workflow failed");
        }
      });

      return reply.status(202).send({
        data: {
          message: "Workflow started in background",
          migrationId: id,
          status: "processing",
        },
      });
    },
  });
}
