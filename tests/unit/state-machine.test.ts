// ============================================================
// MIGR8 State Machine Unit Tests
// Tests valid transitions, forbidden jumps, terminal states
// ============================================================

import { describe, it, expect } from "vitest";
import { isValidTransition, assertValidTransition, isTerminalState } from "../../core/state-machine/transitions.js";
import { InvalidStateTransitionError } from "../../core/errors/domain-errors.js";

describe("MIGR8 State Machine", () => {
  it("allows valid forward transitions", () => {
    expect(isValidTransition("INTAKE", "DISCOVERING")).toBe(true);
    expect(isValidTransition("DISCOVERING", "PLANNING")).toBe(true);
    expect(isValidTransition("PLANNING", "CRITIQUING")).toBe(true);
    expect(isValidTransition("CRITIQUING", "REHEARSING")).toBe(true);
    expect(isValidTransition("REHEARSING", "RISK_EVALUATION")).toBe(true);
    expect(isValidTransition("RISK_EVALUATION", "REPLANNING")).toBe(true);
    expect(isValidTransition("REPLANNING", "CRITIQUING")).toBe(true);
    expect(isValidTransition("RISK_EVALUATION", "EVIDENCE_READY")).toBe(true);
    expect(isValidTransition("EVIDENCE_READY", "AWAITING_APPROVAL")).toBe(true);
    expect(isValidTransition("AWAITING_APPROVAL", "APPROVED")).toBe(true);
    expect(isValidTransition("APPROVED", "POLICY_VALIDATION")).toBe(true);
    expect(isValidTransition("POLICY_VALIDATION", "EXECUTING")).toBe(true);
    expect(isValidTransition("EXECUTING", "VERIFYING")).toBe(true);
    expect(isValidTransition("VERIFYING", "COMPLETE")).toBe(true);
  });

  it("strictly forbids skipping security gates (e.g. PLANNING directly to EXECUTING)", () => {
    expect(isValidTransition("PLANNING", "EXECUTING")).toBe(false);
    expect(isValidTransition("INTAKE", "APPROVED")).toBe(false);
    expect(isValidTransition("DISCOVERING", "EXECUTING")).toBe(false);
    expect(isValidTransition("REHEARSING", "EXECUTING")).toBe(false);
    expect(isValidTransition("APPROVED", "EXECUTING")).toBe(false); // Must go through POLICY_VALIDATION

    expect(() => assertValidTransition("PLANNING", "EXECUTING")).toThrow(InvalidStateTransitionError);
    expect(() => assertValidTransition("INTAKE", "COMPLETE")).toThrow(InvalidStateTransitionError);
  });

  it("correctly identifies terminal states", () => {
    expect(isTerminalState("COMPLETE")).toBe(true);
    expect(isTerminalState("REJECTED")).toBe(true);
    expect(isTerminalState("CANCELLED")).toBe(true);

    expect(isTerminalState("PLANNING")).toBe(false);
    expect(isTerminalState("REHEARSING")).toBe(false);
    expect(isTerminalState("EXECUTING")).toBe(false);
    expect(isTerminalState("INTAKE")).toBe(false);
  });
});
