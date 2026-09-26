// ============================================================
// MIGR8 API Server — Main Entry Point
// Fastify + TypeScript + Zod + OpenAPI
// ============================================================

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { migrationRoutes } from "../api/routes/migrations.js";
import { analyticsRoutes } from "../api/routes/analytics.js";
import { getPool } from "../db/connection.js";
import { logger } from "../observability/logger/index.js";
import { Migr8Error } from "../core/errors/domain-errors.js";

const PORT = parseInt(process.env["PORT"] ?? "3001");
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function buildApp() {
  const app = Fastify({
    logger: logger as unknown as boolean,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "request_id",
    disableRequestLogging: false,
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });

  // CORS — allowlist only
  await app.register(cors, {
    origin: process.env["CORS_ORIGINS"]?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: { code: "PROVIDER_RATE_LIMITED", message: "Rate limit exceeded" },
    }),
  });

  // OpenAPI docs
  await app.register(swagger, {
    openapi: {
      info: {
        title: "MIGR8 API",
        description: "Autonomous Production Database Change Rehearsal and Verification",
        version: "1.0.0",
      },
      tags: [
        { name: "migrations", description: "Migration lifecycle endpoints" },
        { name: "analytics", description: "Model and cost analytics" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list" },
  });

  // Secret redaction — never return secrets in error responses
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Migr8Error) {
      return reply.status(error.httpStatus).send(error.toJSON());
    }

    // Validation errors from Zod
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.validation,
        },
      });
    }

    // Internal errors — never expose stack traces in production
    const isDev = process.env["NODE_ENV"] === "development";
    logger.error({ err: error, requestId: request.id }, "Unhandled error");

    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: isDev ? error.message : "Internal server error",
        ...(isDev && { stack: error.stack }),
      },
    });
  });

  // Routes
  await app.register(async (v1) => {
    await v1.register(migrationRoutes);
    await v1.register(analyticsRoutes);
  }, { prefix: "/api/v1" });

  return app;
}

async function main() {
  // Validate required config at startup
  const requiredConfig = ["DATABASE_URL", "APPROVAL_TOKEN_SECRET"];
  const missingConfig = requiredConfig.filter((k) => !process.env[k]);

  if (missingConfig.length > 0) {
    logger.error({ missingConfig }, "Missing required configuration");
    process.exit(1);
  }

  // Warm up database pool
  try {
    getPool();
    logger.info("Database pool initialized");
  } catch (err) {
    logger.error({ err }, "Failed to initialize database pool");
    process.exit(1);
  }

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info(
      {
        port: PORT,
        neonReadMode: process.env["NEON_READONLY_TOKEN"] ? "real" : "demo",
        neonWriteMode: process.env["NEON_WRITE_TOKEN"] ? "real" : "unavailable",
        modelGateway: process.env["TRUEFOUNDRY_GATEWAY_URL"] ? "configured" : "mock",
        demoMode: process.env["ENABLE_DEMO_MODE"] === "true",
      },
      "MIGR8 API server started"
    );
  } catch (err) {
    logger.error({ err }, "Server failed to start");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
