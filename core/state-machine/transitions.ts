// ============================================================
// MIGR8 State Machine — Centralized Transition Validator
// No client may bypass this. Every state change goes through here.
// ============================================================

import type { MigrationState } from "../types/migration.js";
import { InvalidStateTransitionError } from "../errors/domain-errors.js";

type TransitionMap = Record<MigrationState, MigrationState[]>;

/**
 * Allowed state transitions. Only entries here are legal.
 * ANY other transition is rejected at the domain level.
 */
const ALLOWED_TRANSITIONS: TransitionMap = {
  INTAKE:              ["DISCOVERING", "CANCELLED", "FAILED"],
  DISCOVERING:         ["PLANNING", "FAILED", "CANCELLED"],
  PLANNING:            ["CRITIQUING", "FAILED", "CANCELLED"],
  CRITIQUING:          ["REHEARSING", "REPLANNING", "FAILED", "CANCELLED"],
  REHEARSING:          ["RISK_EVALUATION", "FAILED", "CANCELLED"],
  RISK_EVALUATION:     ["EVIDENCE_READY", "REPLANNING", "BLOCKED", "FAILED"],
  REPLANNING:          ["CRITIQUING", "BLOCKED", "FAILED", "CANCELLED"],
  EVIDENCE_READY:      ["AWAITING_APPROVAL", "FAILED"],
  AWAITING_APPROVAL:   ["APPROVED", "REJECTED", "STALE", "FAILED"],
  APPROVED:            ["POLICY_VALIDATION", "FAILED"],
  POLICY_VALIDATION:   ["EXECUTING", "FAILED", "REJECTED"],
  EXECUTING:           ["VERIFYING", "FAILED"],
  VERIFYING:           ["COMPLETE", "FAILED"],
  COMPLETE:            [], // Terminal
  FAILED:              ["REPLANNING", "CANCELLED"], // Allow retry from failure
  REJECTED:            [], // Terminal
  STALE:               ["DISCOVERING", "CANCELLED"], // Must re-discover
  BLOCKED:             ["CANCELLED", "FAILED"], // Admin intervention needed
  CANCELLED:           [], // Terminal
};

/**
 * Terminal states — once reached, no further transitions except where explicitly allowed.
 */
export const TERMINAL_STATES: Set<MigrationState> = new Set([
  "COMPLETE",
  "REJECTED",
  "CANCELLED",
]);

/**
 * States that require human approval to proceed forward.
 */
export const APPROVAL_GATED_STATES: Set<MigrationState> = new Set([
  "AWAITING_APPROVAL",
  "APPROVED",
  "POLICY_VALIDATION",
  "EXECUTING",
  "VERIFYING",
  "COMPLETE",
]);

/**
 * The ONLY valid path to EXECUTING must pass through:
 * EVIDENCE_READY → AWAITING_APPROVAL → APPROVED → POLICY_VALIDATION → EXECUTING
 *
 * This is enforced by the transition map above AND verified here explicitly.
 */
export function assertValidTransition(
  from: MigrationState,
  to: MigrationState,
  context?: string
): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidStateTransitionError(from, to, context);
  }

  // Extra explicit guard: EXECUTING must only come from POLICY_VALIDATION
  if (to === "EXECUTING" && from !== "POLICY_VALIDATION") {
    throw new InvalidStateTransitionError(
      from,
      to,
      "EXECUTING state requires passing through POLICY_VALIDATION"
    );
  }
}

export function isValidTransition(from: MigrationState, to: MigrationState): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) return false;
  if (to === "EXECUTING" && from !== "POLICY_VALIDATION") return false;
  return true;
}

export function isTerminalState(state: MigrationState): boolean {
  return TERMINAL_STATES.has(state);
}

export function requiresApprovalGating(state: MigrationState): boolean {
  return APPROVAL_GATED_STATES.has(state);
}

export function getAllowedTransitions(from: MigrationState): MigrationState[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}
