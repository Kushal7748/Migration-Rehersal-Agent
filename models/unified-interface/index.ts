// ============================================================
// MIGR8 Unified Model Interface
// Business logic NEVER imports provider SDKs directly.
// All model calls go through this interface.
// ============================================================

import type { ModelTaskClass } from "../../core/types/migration.js";

export type ModelCapability =
  | "STRUCTURED_OUTPUT"
  | "FUNCTION_CALLING"
  | "LONG_CONTEXT"
  | "MULTILINGUAL"
  | "CODE_EXECUTION"
  | "REASONING"
  | "FAST_INFERENCE"
  | "LOW_COST";

export interface UnifiedModelRequest {
  taskClass: ModelTaskClass;
  systemPrompt: string;
  userPrompt: string;
  requiredCapabilities?: ModelCapability[];
  maxTokens?: number;
  temperature?: number;
  schema?: Record<string, unknown>; // For structured output
  migrationRequestId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostEstimate {
  estimatedUsd: number;
  perInputTokenUsd: number;
  perOutputTokenUsd: number;
}

export type NormalizedErrorCode =
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "TIMEOUT"
  | "CONTEXT_OVERFLOW"
  | "PROVIDER_UNAVAILABLE"
  | "MALFORMED_RESPONSE"
  | "INVALID_TOOL_CALL"
  | "UNKNOWN";

export interface NormalizedModelError {
  code: NormalizedErrorCode;
  message: string;
  retryable: boolean;
  provider?: string;
  model?: string;
}

export interface HealthStatus {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface UnifiedModelResponse {
  content: string;
  usage: TokenUsage;
  model: string;
  provider: string;
  latencyMs: number;
  finishReason: string;
  fallbackUsed: boolean;
  parsedJson?: unknown;
}

export interface UnifiedModelClient {
  generate(request: UnifiedModelRequest): Promise<UnifiedModelResponse>;
  supports(capability: ModelCapability): boolean;
  normalizeError(error: unknown): NormalizedModelError;
  estimateCost(usage: TokenUsage): CostEstimate;
  healthCheck(): Promise<HealthStatus>;
  readonly modelId: string;
  readonly provider: string;
}
