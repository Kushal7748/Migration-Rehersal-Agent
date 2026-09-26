// Analytics and health routes

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { query } from "../../db/connection.js";
import { authenticateRequest } from "../middleware/auth.js";
import { checkDatabaseHealth } from "../../db/connection.js";

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Model analytics
  fastify.get("/analytics/models", {
    preHandler: [authenticateRequest],
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await query(`
        SELECT
          provider,
          selected_model,
          task_class,
          COUNT(*) as total_calls,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(estimated_cost_usd) as total_estimated_cost_usd,
          AVG(latency_ms) as avg_latency_ms,
          COUNT(*) FILTER (WHERE status = 'FALLBACK_USED') as fallback_count,
          COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count
        FROM model_routing_log
        GROUP BY provider, selected_model, task_class
        ORDER BY total_calls DESC
      `);
      return reply.send({ data: result.rows });
    },
  });

  // Cost analytics
  fastify.get("/analytics/cost", {
    preHandler: [authenticateRequest],
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await query(`
        SELECT
          DATE_TRUNC('day', created_at) as day,
          provider,
          SUM(estimated_cost_usd) as total_cost_usd,
          SUM(total_tokens) as total_tokens
        FROM model_routing_log
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at), provider
        ORDER BY day DESC, provider
      `);
      return reply.send({ data: result.rows });
    },
  });

  // Health
  fastify.get("/health", {
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ status: "ok", timestamp: new Date().toISOString() });
    },
  });

  // Readiness
  fastify.get("/ready", {
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const dbHealthy = await checkDatabaseHealth();
      const configValid = !!(
        process.env["DATABASE_URL"] &&
        process.env["APPROVAL_TOKEN_SECRET"]
      );

      const neonWriteAvailable = !!process.env["NEON_WRITE_TOKEN"];
      const neonReadAvailable = !!process.env["NEON_READONLY_TOKEN"];

      const status = {
        database: dbHealthy ? "ok" : "unavailable",
        config: configValid ? "ok" : "missing_required",
        neon_read: neonReadAvailable ? "ok" : "demo_mode",
        neon_write: neonWriteAvailable ? "ok" : "unavailable",
        execution_mode: neonWriteAvailable ? "production" : "demo",
        model_gateway: process.env["TRUEFOUNDRY_GATEWAY_URL"] ? "configured" : "mock_mode",
      };

      const isReady = (dbHealthy || process.env["ENABLE_DEMO_MODE"] === "true") && configValid;

      return reply.status(200).send({
        ready: isReady,
        ...status,
      });
    },
  });
}
