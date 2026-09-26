// ============================================================
// MIGR8 OpenAI/TrueFoundry Gateway Adapter
// ============================================================

import type {
  UnifiedModelClient,
  UnifiedModelRequest,
  UnifiedModelResponse,
  ModelCapability,
  TokenUsage,
  CostEstimate,
  NormalizedModelError,
  HealthStatus,
} from "../unified-interface/index.js";
import { logger } from "../../observability/logger/index.js";

export class OpenAIAdapter implements UnifiedModelClient {
  public readonly modelId: string;
  public readonly provider: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(modelId: string, provider = "openai", baseUrl?: string) {
    this.modelId = modelId;
    this.provider = provider;
    this.apiKey = process.env["TRUEFOUNDRY_GATEWAY_API_KEY"] ??
                  process.env["OPENAI_API_KEY"] ?? "";
    this.baseUrl = baseUrl ??
                   process.env["TRUEFOUNDRY_GATEWAY_URL"] ??
                   "https://api.openai.com/v1";
  }

  async generate(request: UnifiedModelRequest): Promise<UnifiedModelResponse> {
    const startTime = Date.now();
    
    if (!this.apiKey) {
      logger.warn({ model: this.modelId }, "No API key configured — returning mock response");
      return this.mockResponse(request);
    }

    try {
      const body: Record<string, unknown> = {
        model: this.modelId,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.1,
      };

      if (request.schema) {
        body["response_format"] = {
          type: "json_schema",
          json_schema: { name: "response", schema: request.schema, strict: true },
        };
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      };

      const content = data.choices[0]?.message?.content ?? "";
      const usage: TokenUsage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      let parsedJson: unknown;
      if (request.schema) {
        try { parsedJson = JSON.parse(content); } catch {}
      }

      return {
        content,
        usage,
        model: this.modelId,
        provider: this.provider,
        latencyMs: Date.now() - startTime,
        finishReason: data.choices[0]?.finish_reason ?? "stop",
        fallbackUsed: false,
        parsedJson,
      };
    } catch (err) {
      logger.error({ err, model: this.modelId }, "Model call failed");
      throw err;
    }
  }

  private mockResponse(request: UnifiedModelRequest): UnifiedModelResponse {
    const mockContent = this.generateMockContent(request);
    return {
      content: mockContent,
      usage: { inputTokens: 150, outputTokens: 300, totalTokens: 450 },
      model: this.modelId,
      provider: this.provider,
      latencyMs: 250,
      finishReason: "stop",
      fallbackUsed: false,
      parsedJson: (() => { try { return JSON.parse(mockContent); } catch { return undefined; } })(),
    };
  }

  private generateMockContent(request: UnifiedModelRequest): string {
    // Task-specific mock responses for demo mode
    if (request.taskClass === "INTENT_PARSING") {
      return JSON.stringify({
        operation: "schema_change",
        targetTable: "users",
        requestedChanges: [
          { type: "add_column", name: "fraud_score", dataType: "float" },
          { type: "backfill", targetColumn: "fraud_score" },
        ],
        rawText: request.userPrompt,
      });
    }
    if (request.taskClass === "MIGRATION_PLANNING") {
      const isReplan = request.userPrompt.includes("REPLAN") || request.userPrompt.includes("failure");
      if (isReplan) {
        return JSON.stringify({
          proposed_sql: [
            "ALTER TABLE users ADD COLUMN fraud_score FLOAT",
            "UPDATE users SET fraud_score = 0.0 WHERE id IN (SELECT id FROM users WHERE fraud_score IS NULL LIMIT 10000)",
          ],
          rollback_sql: ["ALTER TABLE users DROP COLUMN IF EXISTS fraud_score"],
          strategy_notes: "Revised plan: nullable column first, then chunked backfill to minimize lock duration.",
          assumptions: ["Chunked UPDATE limits lock to < 2000ms per batch"],
          risk_hint: "LOW",
        });
      }
      return JSON.stringify({
        proposed_sql: [
          "ALTER TABLE users ADD COLUMN fraud_score FLOAT NOT NULL DEFAULT 0.0",
          "UPDATE users SET fraud_score = 0.0",
        ],
        rollback_sql: ["ALTER TABLE users DROP COLUMN IF EXISTS fraud_score"],
        strategy_notes: "Simple plan: add column with default and backfill all rows.",
        assumptions: ["Table has moderate data volume"],
        risk_hint: "MEDIUM",
      });
    }
    if (request.taskClass === "INDEPENDENT_CRITIQUE") {
      return JSON.stringify({
        approved_for_rehearsal: true,
        blocking_issues: [],
        non_blocking_issues: ["Consider chunked backfill for large tables"],
        recommended_changes: [],
      });
    }
    if (request.taskClass === "EVIDENCE_SUMMARY") {
      return "Migration plan has been rehearsed and evidence collected. Risk evaluation complete.";
    }
    return "Mock response for " + request.taskClass;
  }

  supports(capability: ModelCapability): boolean {
    const supported: ModelCapability[] = [
      "STRUCTURED_OUTPUT", "FUNCTION_CALLING", "LONG_CONTEXT", "REASONING",
    ];
    return supported.includes(capability);
  }

  normalizeError(error: unknown): NormalizedModelError {
    const err = error as Error & { status?: number };
    if (err.message?.includes("429")) return { code: "RATE_LIMITED", message: err.message, retryable: true };
    if (err.message?.includes("401")) return { code: "AUTH_FAILED", message: err.message, retryable: false };
    if (err.message?.includes("timeout")) return { code: "TIMEOUT", message: err.message, retryable: true };
    return { code: "UNKNOWN", message: err.message ?? "Unknown error", retryable: false };
  }

  estimateCost(usage: TokenUsage): CostEstimate {
    const inputRate = 0.000003; // $3/M tokens
    const outputRate = 0.000015;
    return {
      estimatedUsd: usage.inputTokens * inputRate + usage.outputTokens * outputRate,
      perInputTokenUsd: inputRate,
      perOutputTokenUsd: outputRate,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.apiKey) return { healthy: false, error: "No API key configured" };
    return { healthy: true, latencyMs: 0 };
  }
}
