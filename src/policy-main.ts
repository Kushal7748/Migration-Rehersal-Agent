// ============================================================
// MIGR8 Policy Service — Independent Security Microservice
// Runs as a separate process / container (migr8-policy)
// The ONLY service holding production write credentials.
// ============================================================

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { z } from "zod";
import { executeProductionMigration } from "../policy/execution/index.js";
import { verifyApprovalToken } from "../policy/approval-token/index.js";
import { getPool } from "../db/connection.js";
import { logger } from "../observability/logger/index.js";
import { Migr8Error } from "../core/errors/domain-errors.js";

const PORT = parseInt(process.env["POLICY_PORT"] ?? "3002", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";

const ExecuteRequestSchema = z.object({
  migrationRequestId: z.string().uuid(),
  approvalToken: z.string().min(10),
  approverId: z.string().min(1),
});

const ValidateTokenSchema = z.object({
  token: z.string(),
  expectedEvidenceId: z.string().uuid(),
  expectedMigrationId: z.string().uuid(),
  expectedApprover: z.string(),
  expectedAction: z.enum(["APPROVE", "REJECT"]),
});

async function buildPolicyApp() {
  const app = Fastify({
    logger: logger as unknown as boolean,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "request_id",
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: process.env["CORS_ORIGINS"]?.split(",") ?? ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"],
    credentials: true,
  });

  // Health
  app.get("/health", async (_req, reply) => {
    try {
      const pool = getPool();
      await pool.query("SELECT 1");
      return reply.send({
        status: "UP",
        service: "migr8-policy-service",
        hasWriteCredentials: Boolean(process.env["NEON_WRITE_TOKEN"] || process.env["DATABASE_URL"]),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      return reply.status(503).send({
        status: "DOWN",
        service: "migr8-policy-service",
        error: (err as Error).message,
      });
    }
  });

  // Independent Policy Execution Endpoint
  app.post("/api/v1/policy/execute", async (req, reply) => {
    const parseResult = ExecuteRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid execution payload",
          details: parseResult.error.errors,
        },
      });
    }

    const { migrationRequestId, approvalToken, approverId } = parseResult.data;
    const requestIp = req.ip;
    const userAgent = req.headers["user-agent"];

    try {
      const result = await executeProductionMigration({
        migrationRequestId,
        approvalToken,
        approverId,
        requestIp,
        userAgent,
      });

      return reply.send(result);
    } catch (err: unknown) {
      if (err instanceof Migr8Error) {
        return reply.status(err.httpStatus).send(err.toJSON());
      }
      req.log.error({ err }, "Unhandled policy execution error");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error during guarded execution",
        },
      });
    }
  });

  // Validate Token Endpoint
  app.post("/api/v1/policy/tokens/validate", async (req, reply) => {
    const parseResult = ValidateTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload", details: parseResult.error.errors },
      });
    }

    const { token, expectedEvidenceId, expectedMigrationId, expectedApprover, expectedAction } = parseResult.data;
    const result = verifyApprovalToken(
      token,
      expectedEvidenceId,
      expectedMigrationId,
      expectedApprover,
      expectedAction
    );

    return reply.send(result);
  });

  return app;
}

async function start() {
  try {
    const app = await buildPolicyApp();
    await app.listen({ port: PORT, host: HOST });
    logger.info(`🛡️ MIGR8 Independent Policy Service running on port ${PORT}`);
  } catch (err) {
    logger.error({ err }, "Failed to start MIGR8 Policy Service");
    process.exit(1);
  }
}

if (process.env["NODE_ENV"] !== "test") {
  start();
}

export { buildPolicyApp };
