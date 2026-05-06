/**
 * Single Bedrock client for every AI surface in this app.
 *
 * Why a single helper:
 *   - One BAA, one IAM-scoped vendor, one billing line. HIPAA audit story
 *     becomes "all PHI-adjacent inference goes through AWS Bedrock under
 *     our signed BAA" instead of justifying multiple vendors.
 *   - Anthropic message body is shared across Bedrock-hosted Claude models,
 *     so we don't pay the abstraction tax of a generic LLM router.
 *
 * Auth: picks up AWS credentials from the standard chain
 *   AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (env), or instance/IAM role.
 * Region: AWS_REGION env (default us-east-1 — Mumbai doesn't host Anthropic
 *   models on Bedrock today; revisit if/when Anthropic models land in
 *   ap-south-1).
 *
 * Model IDs default to cross-region inference profiles (us.* prefix) so a
 * single account-level model-access approval works across us-east-1/2 +
 * us-west-2. Override per-surface via the BEDROCK_MODEL_* env vars below.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

// Bedrock client is pinned to a region that actually hosts Anthropic models.
// Prod ECS runs in ap-south-1 (Mumbai, near our warehouse RDS) — but Anthropic
// is not hosted on Bedrock there, so any us.* cross-region inference profile
// resolves to ValidationException. Allow override via BEDROCK_REGION for the
// rare case the prod account needs a different US region; default to us-east-1
// which has all the cross-region inference profiles we use.
const REGION = process.env.BEDROCK_REGION || "us-east-1";

// Cross-region inference profile IDs — works in us-east-1 / us-east-2 / us-west-2.
// Sonnet 4 was marked Legacy by Anthropic on Bedrock; Sonnet 4.5 is the active
// equivalent (same price tier, current model).
export const BEDROCK_MODEL_IDS = {
  pageSummary:
    process.env.BEDROCK_MODEL_PAGE_SUMMARY ||
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  askAi:
    process.env.BEDROCK_MODEL_ASK_AI ||
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  chartConfig:
    process.env.BEDROCK_MODEL_CHART_CONFIG ||
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
} as const;

let _client: BedrockRuntimeClient | null = null;
function client(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({ region: REGION });
  }
  return _client;
}

export interface BedrockMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InvokeBedrockParams {
  model: string;
  system?: string;
  messages: BedrockMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface InvokeBedrockResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Invoke a Bedrock-hosted Anthropic Claude model. Single round-trip,
 * non-streaming. Returns the text content of the first text block plus
 * token usage so callers can log/charge.
 *
 * Throws if AWS_ACCESS_KEY_ID is not configured — fail loudly rather than
 * silently degrade to a non-HIPAA fallback.
 */
export async function invokeBedrock({
  model,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.7,
}: InvokeBedrockParams): Promise<InvokeBedrockResult> {
  // Don't gate on env vars — ECS task role / EKS IRSA / Lambda execution role
  // all provide credentials via the AWS metadata service without setting any
  // env var. The SDK's default credential chain handles all of these. Let the
  // SDK throw its own (more informative) credential error if nothing is
  // available, instead of false-negative-blocking valid IAM role auth.

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const cmd = new InvokeModelCommand({
    modelId: model,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(JSON.stringify(body)),
  });

  const response = await client().send(cmd);
  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const textBlock = parsed.content?.find((c) => c.type === "text");
  return {
    text: textBlock?.text ?? "",
    inputTokens: parsed.usage?.input_tokens ?? 0,
    outputTokens: parsed.usage?.output_tokens ?? 0,
  };
}
