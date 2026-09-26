// ============================================================
// MIGR8 Authentication & Authorization Middleware
// Server-side role enforcement. Never trust frontend roles.
// ============================================================

import type { FastifyRequest, FastifyReply } from "fastify";
import { createHash, createHmac } from "crypto";
import { query } from "../../db/connection.js";
import type { UserRole } from "../../core/types/migration.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Verify Bearer token and load user from database.
 * NEVER trusts client-provided role claims.
 */
export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: { code: "AUTHENTICATION_ERROR", message: "Bearer token required" } });
  }

  const token = authHeader.substring(7);

  try {
    // Verify token — in production this verifies a JWT or session token
    const user = await verifyToken(token);
    if (!user) {
      return reply.status(401).send({ error: { code: "AUTHENTICATION_ERROR", message: "Invalid token" } });
    }
    request.user = user;
  } catch {
    return reply.status(401).send({ error: { code: "AUTHENTICATION_ERROR", message: "Authentication failed" } });
  }
}

/**
 * Require specific role. Must be called after authenticateRequest.
 */
export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: { code: "AUTHENTICATION_ERROR", message: "Not authenticated" } });
    }
    if (!roles.includes(request.user.role)) {
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, metadata)
         VALUES ($1,$2,$3,$4)`,
        ["HUMAN", request.user.id, "AUTHORIZATION_DENIED",
         JSON.stringify({ requiredRoles: roles, actualRole: request.user.role, path: request.url })]
      );
      return reply.status(403).send({
        error: {
          code: "AUTHORIZATION_ERROR",
          message: `Role ${roles.join(" or ")} required, got ${request.user.role}`,
        },
      });
    }
  };
}

async function verifyToken(token: string): Promise<AuthenticatedUser | null> {
  // Demo/development: simple token format "demo:{userId}"
  if (token.startsWith("demo:")) {
    const userId = token.substring(5);
    try {
      const result = await query("SELECT id, email, role FROM users WHERE id = $1", [userId]);
      if (result.rows.length > 0) {
        const row = result.rows[0] as { id: string; email: string; role: UserRole };
        return { id: row.id, email: row.email, role: row.role };
      }
    } catch {
      // Database query error in demo mode
    }
    if (process.env["ENABLE_DEMO_MODE"] === "true") {
      return { id: userId, email: "admin@migr8.internal", role: "ADMIN" };
    }
    return null;
  }

  // Production: verify HMAC session token
  const jwtSecret = process.env["JWT_SECRET"] ?? process.env["APPROVAL_TOKEN_SECRET"];
  if (!jwtSecret) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, signature] = parts as [string, string];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as {
      userId: string;
      exp: number;
    };
    if (Date.now() > payload.exp * 1000) return null;

    const expectedSig = createHmac("sha256", jwtSecret).update(payloadB64).digest("hex");
    if (signature !== expectedSig) return null;

    const result = await query("SELECT id, email, role FROM users WHERE id = $1", [payload.userId]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as { id: string; email: string; role: UserRole };
    return { id: row.id, email: row.email, role: row.role };
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = process.env["PASSWORD_SALT"] ?? "migr8-dev-salt";
  return createHash("sha256").update(password + salt).digest("hex");
}

export function generateDevToken(userId: string): string {
  return `demo:${userId}`;
}
