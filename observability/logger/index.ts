// ============================================================
// MIGR8 Structured Logger
// Redacts all secrets before any output.
// ============================================================

import pino from "pino";

// Patterns that must NEVER appear in logs
const SECRET_PATTERNS = [
  /NEON_WRITE_TOKEN=[^\s]*/gi,
  /NEON_READONLY_TOKEN=[^\s]*/gi,
  /APPROVAL_TOKEN_SECRET=[^\s]*/gi,
  /TRUEFOUNDRY_GATEWAY_API_KEY=[^\s]*/gi,
  /TRUEFORGE_API_KEY=[^\s]*/gi,
  /Authorization: Bearer \S+/gi,
  /password[=:]\s*\S+/gi,
  /secret[=:]\s*\S+/gi,
  /token[=:]\s*[a-zA-Z0-9._-]{20,}/gi,
];

const SECRET_FIELDS = new Set([
  "NEON_WRITE_TOKEN",
  "NEON_READONLY_TOKEN",
  "APPROVAL_TOKEN_SECRET",
  "TRUEFOUNDRY_GATEWAY_API_KEY",
  "TRUEFORGE_API_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "password",
  "secret",
  "token",
  "authorization",
  "x-api-key",
]);

function redactSecrets(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SECRET_FIELDS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "string") {
      result[key] = redactSecrets(val);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      result[key] = redactObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  formatters: {
    level(label) {
      return { level: label };
    },
    bindings(bindings) {
      return {
        service: process.env["SERVICE_NAME"] ?? "migr8",
        pid: bindings["pid"],
        hostname: bindings["hostname"],
      };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req: { method: string; url: string; id: string }) => ({
      method: req.method,
      url: req.url,
      requestId: req.id,
    }),
    res: (res: { statusCode: number }) => ({
      statusCode: res.statusCode,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createRequestLogger(
  migrationId?: string,
  requestId?: string
) {
  return logger.child({
    migration_id: migrationId,
    request_id: requestId,
  });
}

export function createServiceLogger(service: string) {
  return logger.child({ service });
}

export { redactObject, redactSecrets };
