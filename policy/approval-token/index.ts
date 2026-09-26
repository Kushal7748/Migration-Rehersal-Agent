// ============================================================
// MIGR8 Approval Token — HMAC-SHA256
// Cryptographically bound to: evidence_id, migration_id,
// approver, action, issued_at, expiry, nonce.
// Single use. Time-limited. Cannot be reused or replayed.
// ============================================================

import { createHmac, createHash, randomBytes } from "crypto";
import { ApprovalTokenError } from "../../core/errors/domain-errors.js";

export interface ApprovalTokenPayload {
  evidenceId: string;
  migrationRequestId: string;
  approverId: string;
  action: "APPROVE" | "REJECT";
  issuedAt: number; // Unix timestamp ms
  expiresAt: number; // Unix timestamp ms
  nonce: string;
}

export interface MintedToken {
  token: string; // The signed token (sent to approver)
  tokenHash: string; // SHA256 of the token (stored in DB for single-use check)
  nonce: string;
  payload: ApprovalTokenPayload;
  expiresAt: Date;
}

function getSecret(): string {
  const secret = process.env["APPROVAL_TOKEN_SECRET"];
  if (!secret) {
    throw new Error("APPROVAL_TOKEN_SECRET environment variable is required");
  }
  return secret;
}

function getTtlSeconds(): number {
  return parseInt(process.env["APPROVAL_TOKEN_TTL_SECONDS"] ?? "120");
}

/**
 * Mint a new approval token.
 * The token is HMAC-SHA256 signed using APPROVAL_TOKEN_SECRET.
 * It cannot be forged without the secret.
 */
export function mintApprovalToken(
  evidenceId: string,
  migrationRequestId: string,
  approverId: string,
  action: "APPROVE" | "REJECT"
): MintedToken {
  const secret = getSecret();
  const nonce = randomBytes(32).toString("hex");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + getTtlSeconds() * 1000;

  const payload: ApprovalTokenPayload = {
    evidenceId,
    migrationRequestId,
    approverId,
    action,
    issuedAt,
    expiresAt,
    nonce,
  };

  // Canonical payload string — order is deterministic
  const canonical = [
    payload.evidenceId,
    payload.migrationRequestId,
    payload.approverId,
    payload.action,
    payload.issuedAt.toString(),
    payload.expiresAt.toString(),
    payload.nonce,
  ].join("|");

  const signature = createHmac("sha256", secret).update(canonical).digest("hex");

  // Token = base64(payload JSON) + "." + signature
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${payloadB64}.${signature}`;

  // Hash of the full token stored in DB for single-use enforcement
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return {
    token,
    tokenHash,
    nonce,
    payload,
    expiresAt: new Date(expiresAt),
  };
}

/**
 * Verify an approval token.
 * Checks: signature validity, expiry, binding correctness.
 * Does NOT check single-use — that requires a database lookup (done in Policy Service).
 */
export function verifyApprovalToken(
  token: string,
  expectedEvidenceId: string,
  expectedMigrationRequestId: string,
  expectedApproverId: string,
  expectedAction: "APPROVE" | "REJECT"
): ApprovalTokenPayload {
  const secret = getSecret();

  // Parse token
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new ApprovalTokenError("APPROVAL_TOKEN_INVALID", "Malformed token structure");
  }

  const [payloadB64, signature] = parts as [string, string];

  // Decode payload
  let payload: ApprovalTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ApprovalTokenPayload;
  } catch {
    throw new ApprovalTokenError("APPROVAL_TOKEN_INVALID", "Cannot parse token payload");
  }

  // Verify signature
  const canonical = [
    payload.evidenceId,
    payload.migrationRequestId,
    payload.approverId,
    payload.action,
    payload.issuedAt.toString(),
    payload.expiresAt.toString(),
    payload.nonce,
  ].join("|");

  const expectedSignature = createHmac("sha256", secret).update(canonical).digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new ApprovalTokenError("APPROVAL_TOKEN_INVALID", "Token signature verification failed");
  }

  // Check expiry
  if (Date.now() > payload.expiresAt) {
    throw new ApprovalTokenError(
      "APPROVAL_TOKEN_EXPIRED",
      `Token expired at ${new Date(payload.expiresAt).toISOString()}`
    );
  }

  // Verify binding — prevent:
  // approve(evidence A) → execute(evidence B)
  // approve(migration A) → replay(migration B)
  if (payload.evidenceId !== expectedEvidenceId) {
    throw new ApprovalTokenError(
      "APPROVAL_TOKEN_INVALID",
      "Token evidence ID does not match"
    );
  }
  if (payload.migrationRequestId !== expectedMigrationRequestId) {
    throw new ApprovalTokenError(
      "APPROVAL_TOKEN_INVALID",
      "Token migration ID does not match"
    );
  }
  if (payload.approverId !== expectedApproverId) {
    throw new ApprovalTokenError(
      "APPROVAL_TOKEN_INVALID",
      "Token approver does not match"
    );
  }
  if (payload.action !== expectedAction) {
    throw new ApprovalTokenError(
      "APPROVAL_TOKEN_INVALID",
      "Token action does not match"
    );
  }

  return payload;
}

/**
 * Compute token hash for DB lookup.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Timing-safe string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
}
