// ============================================================
// MIGR8 Cross-Model Critic
// Independent critic model family evaluates the plan
// BEFORE rehearsal begins. Never has production credentials.
// ============================================================

import { modelRouter } from "../../router/model-router/index.js";
import { logger } from "../../observability/logger/index.js";
import type { SchemaSnapshot, MigrationPlan } from "../../core/types/migration.js";
import type { SqlValidationResult } from "../../risk-engine/sql-validator/index.js";

export interface CriticReviewInput {
  intent: string;
  schema: SchemaSnapshot;
  plan: MigrationPlan;
  deterministicValidation: SqlValidationResult;
}

export interface CriticReviewResult {
  approved_for_rehearsal: boolean;
  model_used: string;
  provider: string;
  blocking_issues: string[];
  non_blocking_issues: string[];
  recommended_changes: string[];
  reasoning: string;
  review_duration_ms: number;
}

export class MigrationCritic {
  async reviewPlan(input: CriticReviewInput): Promise<CriticReviewResult> {
    const startTime = Date.now();
    const log = logger.child({ module: "critic", migrationId: input.plan.migrationRequestId });

    log.info("Starting cross-model critique review");

    const systemPrompt = `You are the MIGR8 Senior Independent Database Critic.
Your role is to rigorously challenge database migration proposals before rehearsal.
You examine lock acquisition risks, concurrency hazards, backfill hazards, and index creation patterns.
You MUST output valid JSON matching this schema:
{
  "approved_for_rehearsal": boolean,
  "blocking_issues": string[],
  "non_blocking_issues": string[],
  "recommended_changes": string[],
  "reasoning": string
}`;

    const userPrompt = `Review this proposed PostgreSQL migration:
Original Intent: ${input.intent}

Target Database Tables:
${JSON.stringify(input.schema.tables.map(t => ({ name: t.name, rows: t.rowCount })), null, 2)}

Proposed Plan:
Strategy: ${input.plan.strategyNotes}
Risk Hint: ${input.plan.riskHint}
Assumptions: ${JSON.stringify(input.plan.assumptions)}
Proposed SQL:
${input.plan.proposedSql.join("\n")}
Rollback SQL:
${input.plan.rollbackSql.join("\n")}

Deterministic Pre-check Findings:
Valid: ${input.deterministicValidation.valid}
Violations: ${JSON.stringify(input.deterministicValidation.violations)}
Warnings: ${JSON.stringify(input.deterministicValidation.warnings)}

Evaluate whether this plan is safe to proceed to isolated rehearsal on a Neon copy-on-write branch.`;

    try {
      const response = await modelRouter.route({
        taskClass: "INDEPENDENT_CRITIQUE",
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 1500,
      });

      let parsed: {
        approved_for_rehearsal?: boolean;
        blocking_issues?: string[];
        non_blocking_issues?: string[];
        recommended_changes?: string[];
        reasoning?: string;
      } = {};

      try {
        parsed = JSON.parse(response.content);
      } catch {
        const match = response.content.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        }
      }

      const blocking = parsed.blocking_issues ?? [];
      const nonBlocking = parsed.non_blocking_issues ?? [];
      const recommendations = parsed.recommended_changes ?? [];
      const approved = parsed.approved_for_rehearsal ?? (blocking.length === 0);

      const result: CriticReviewResult = {
        approved_for_rehearsal: approved && input.deterministicValidation.valid,
        model_used: response.model,
        provider: response.provider,
        blocking_issues: blocking,
        non_blocking_issues: nonBlocking,
        recommended_changes: recommendations,
        reasoning: parsed.reasoning ?? "Critic evaluation completed",
        review_duration_ms: Date.now() - startTime,
      };

      log.info({ approved: result.approved_for_rehearsal, model: result.model_used }, "Critic review complete");
      return result;
    } catch (err: unknown) {
      log.warn({ err }, "Critic model call encountered an issue, falling back to deterministic pre-checks");
      return {
        approved_for_rehearsal: input.deterministicValidation.valid,
        model_used: "deterministic-fallback",
        provider: "local",
        blocking_issues: input.deterministicValidation.violations,
        non_blocking_issues: input.deterministicValidation.warnings,
        recommended_changes: [],
        reasoning: "Deterministic safety engine evaluated plan (model review unavailable)",
        review_duration_ms: Date.now() - startTime,
      };
    }
  }
}

export const migrationCritic = new MigrationCritic();
