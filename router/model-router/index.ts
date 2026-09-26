// ============================================================
// MIGR8 Model Router
// Configuration-driven routing with fallback chains.
// Business logic uses task classes, not model names.
// ============================================================

import { OpenAIAdapter } from "../../models/adapters/openai-adapter.js";
import { query } from "../../db/connection.js";
import { logger } from "../../observability/logger/index.js";
import type { UnifiedModelClient, UnifiedModelRequest, UnifiedModelResponse } from "../../models/unified-interface/index.js";
import type { ModelTaskClass } from "../../core/types/migration.js";

interface ModelConfig {
  modelId: string;
  provider: string;
  baseUrl?: string;
  priority: number;
  capabilities: string[];
  inputCostPer1M: number;
  outputCostPer1M: number;
}

// Model routing configuration — configurable via environment
function getModelCatalog(): Record<ModelTaskClass, ModelConfig[]> {
  const gatewayUrl = process.env["TRUEFOUNDRY_GATEWAY_URL"];

  return {
    INTENT_PARSING: [
      {
        modelId: process.env["INTENT_MODEL_ID"] ?? "gpt-4o-mini",
        provider: "truefoundry",
        baseUrl: gatewayUrl,
        priority: 1,
        capabilities: ["STRUCTURED_OUTPUT", "FAST_INFERENCE", "LOW_COST"],
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.60,
      },
      {
        modelId: "gpt-3.5-turbo",
        provider: "openai",
        priority: 2,
        capabilities: ["STRUCTURED_OUTPUT", "FAST_INFERENCE"],
        inputCostPer1M: 0.50,
        outputCostPer1M: 1.50,
      },
    ],
    DATABASE_INVESTIGATION: [
      {
        modelId: process.env["INVESTIGATION_MODEL_ID"] ?? "gpt-4o",
        provider: "truefoundry",
        baseUrl: gatewayUrl,
        priority: 1,
        capabilities: ["REASONING", "LONG_CONTEXT", "STRUCTURED_OUTPUT"],
        inputCostPer1M: 5.0,
        outputCostPer1M: 15.0,
      },
    ],
    MIGRATION_PLANNING: [
      {
        modelId: process.env["PLANNER_MODEL_ID"] ?? "claude-3-5-sonnet-20241022",
        provider: "truefoundry",
        baseUrl: gatewayUrl,
        priority: 1,
        capabilities: ["REASONING", "LONG_CONTEXT", "STRUCTURED_OUTPUT"],
        inputCostPer1M: 3.0,
        outputCostPer1M: 15.0,
      },
      {
        modelId: "gpt-4o",
        provider: "openai",
        priority: 2,
        capabilities: ["REASONING", "STRUCTURED_OUTPUT"],
        inputCostPer1M: 5.0,
        outputCostPer1M: 15.0,
      },
    ],
    INDEPENDENT_CRITIQUE: [
      {
        modelId: process.env["CRITIC_MODEL_ID"] ?? "claude-3-opus-20240229",
        provider: "truefoundry",
        baseUrl: gatewayUrl,
        priority: 1,
        capabilities: ["REASONING", "LONG_CONTEXT"],
        inputCostPer1M: 15.0,
        outputCostPer1M: 75.0,
      },
      {
        modelId: "gemini-pro",
        provider: "google",
        priority: 2,
        capabilities: ["REASONING", "LONG_CONTEXT"],
        inputCostPer1M: 1.25,
        outputCostPer1M: 5.0,
      },
    ],
    EVIDENCE_SUMMARY: [
      {
        modelId: process.env["SUMMARY_MODEL_ID"] ?? "claude-3-haiku-20240307",
        provider: "truefoundry",
        baseUrl: gatewayUrl,
        priority: 1,
        capabilities: ["FAST_INFERENCE", "LOW_COST"],
        inputCostPer1M: 0.25,
        outputCostPer1M: 1.25,
      },
    ],
    MULTILINGUAL_SUMMARY: [
      {
        modelId: process.env["MULTILINGUAL_MODEL_ID"] ?? "gpt-4o",
        provider: "truefoundry",
        baseUrl: gatewayUrl,
        priority: 1,
        capabilities: ["MULTILINGUAL"],
        inputCostPer1M: 5.0,
        outputCostPer1M: 15.0,
      },
    ],
  };
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1500, 4500]; // Exponential with jitter base

/**
 * Route a model request through the appropriate model with fallback chain.
 */
export async function routeModelRequest(
  request: UnifiedModelRequest
): Promise<UnifiedModelResponse> {
  const catalog = getModelCatalog();
  const models = catalog[request.taskClass];

  if (!models || models.length === 0) {
    throw new Error(`No models configured for task class: ${request.taskClass}`);
  }

  let lastError: Error | null = null;
  let fallbackUsed = false;
  const selectedModel = models[0]!;

  for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
    const modelConfig = models[modelIdx]!;
    if (modelIdx > 0) fallbackUsed = true;

    const client = new OpenAIAdapter(modelConfig.modelId, modelConfig.provider, modelConfig.baseUrl);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const startTime = Date.now();
        const response = await client.generate(request);
        const latencyMs = Date.now() - startTime;

        // Log routing decision
        await logModelRouting({
          migrationRequestId: request.migrationRequestId,
          taskClass: request.taskClass,
          selectedModel: modelConfig.modelId,
          provider: modelConfig.provider,
          fallbackModel: fallbackUsed ? models[0]?.modelId : undefined,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens,
          latencyMs: response.latencyMs,
          estimatedCostUsd: (response.usage.inputTokens / 1_000_000) * modelConfig.inputCostPer1M +
                            (response.usage.outputTokens / 1_000_000) * modelConfig.outputCostPer1M,
          retryCount: attempt,
          status: fallbackUsed ? "FALLBACK_USED" : "SUCCESS",
          reason: fallbackUsed ? `Fell back from ${models[0]?.modelId}` : "Primary model",
        });

        return { ...response, fallbackUsed };
      } catch (err) {
        const error = err as Error;
        lastError = error;

        const normalized = client.normalizeError(err);
        
        if (!normalized.retryable) {
          logger.warn({ model: modelConfig.modelId, error: normalized }, "Non-retryable error, trying fallback");
          break; // Try next model
        }

        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt]! + Math.random() * 500;
          logger.warn({ model: modelConfig.modelId, attempt, delay }, "Retrying after delay");
          await sleep(delay);
        }
      }
    }
  }

  // All models failed — log and throw
  await logModelRouting({
    migrationRequestId: request.migrationRequestId,
    taskClass: request.taskClass,
    selectedModel: selectedModel.modelId,
    provider: selectedModel.provider,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    latencyMs: 0,
    estimatedCostUsd: 0,
    retryCount: MAX_RETRIES,
    status: "FAILED",
    reason: lastError?.message ?? "All models failed",
    errorCode: "PROVIDER_UNAVAILABLE",
  });

  throw new Error(`All models failed for task ${request.taskClass}: ${lastError?.message}`);
}

async function logModelRouting(data: {
  migrationRequestId?: string;
  taskClass: ModelTaskClass;
  selectedModel: string;
  provider: string;
  fallbackModel?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  retryCount: number;
  status: string;
  reason: string;
  errorCode?: string;
}) {
  try {
    await query(
      `INSERT INTO model_routing_log (
        migration_request_id, task_class, selected_model, provider,
        reason, fallback_model, input_tokens, output_tokens, total_tokens,
        latency_ms, estimated_cost_usd, retry_count, status, error_code,
        capabilities_required
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        data.migrationRequestId ?? null,
        data.taskClass,
        data.selectedModel,
        data.provider,
        data.reason,
        data.fallbackModel ?? null,
        data.inputTokens,
        data.outputTokens,
        data.totalTokens,
        data.latencyMs,
        data.estimatedCostUsd,
        data.retryCount,
        data.status,
        data.errorCode ?? null,
        JSON.stringify([]),
      ]
    );
  } catch (err) {
    // Logging failure must not break the main flow
    logger.error({ err }, "Failed to log model routing");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const modelRouter = {
  route: routeModelRequest,
};

export class ModelRouter {
  route = routeModelRequest;
}
