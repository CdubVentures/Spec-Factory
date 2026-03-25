import { z } from 'zod';
import { zodToLlmSchema } from '../zodToLlmSchema.js';
import { buildRunId } from '../../../shared/primitives.js';
import { callOpenAI } from './openaiClient.js';
import { resolveLlmRoute, buildEffectiveCostRates } from './routing.js';
import { normalizeCostRates } from '../../../billing/costRates.js';
import { appendCostLedgerEntry } from '../../../billing/costLedger.js';
import { configInt, configBool, configValue } from '../../../shared/settingsAccessor.js';

export const healthCheckResponseZodSchema = z.object({
  ok: z.boolean(),
  provider: z.string(),
  model: z.string(),
  echo: z.string(),
  reasoning_used: z.boolean(),
});

function healthSchema() {
  return zodToLlmSchema(healthCheckResponseZodSchema);
}

function defaultUsageRow() {
  return {
    provider: '',
    model: '',
    prompt_tokens: 0,
    completion_tokens: 0,
    cached_prompt_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    estimated_usage: false,
    retry_without_schema: false,
    deepseek_mode_detected: false,
    json_schema_requested: false
  };
}

function normalized(value) {
  return String(value ?? '').trim();
}

export async function runLlmHealthCheck({
  storage,
  config,
  provider = '',
  model = '',
  providerHealth,
  logger = null
}) {
  const explicitModel = normalized(model);
  const route = resolveLlmRoute(config, {
    role: 'extract',
    modelOverride: explicitModel,
  });
  const resolvedProvider = normalized(
    route.provider || provider || config.llmProvider || configValue(config, 'llmProvider') || 'openai'
  ).toLowerCase();
  const resolvedModel = normalized(
    explicitModel || route.model || configValue(config, 'llmModelPlan')
  );
  const resolvedApiKey = route.apiKey || '';
  const resolvedBaseUrl = normalized(
    route.baseUrl || config.llmBaseUrl || configValue(config, 'llmBaseUrl')
  );

  if (!resolvedApiKey) {
    throw new Error('No API key configured for model');
  }

  const runId = buildRunId();
  const echo = `spec-health-${Date.now()}`;
  const usage = defaultUsageRow();
  const effectiveCostRates = buildEffectiveCostRates(route._registryEntry, normalizeCostRates(config));

  const response = await callOpenAI({
    providerHealth,
    model: resolvedModel,
    system: [
      'You are validating model connectivity and JSON schema output.',
      'Return strict JSON matching schema.',
      'Do not include markdown.'
    ].join('\n'),
    user: JSON.stringify({
      echo,
      request: 'Return ok=true and mirror provider/model and whether reasoning mode was enabled.'
    }),
    jsonSchema: healthSchema(),
    apiKey: resolvedApiKey,
    baseUrl: resolvedBaseUrl,
    provider: resolvedProvider,
    usageContext: {
      category: 'health',
      productId: 'llm-health-check',
      runId,
      round: 0,
      reason: 'health',
      host: '',
      url_count: 0,
      evidence_chars: 0
    },
    costRates: effectiveCostRates,
    onUsage: async (usageRow) => {
      Object.assign(usage, usageRow || {});
      await appendCostLedgerEntry({
        storage,
        config,
        entry: {
          ts: new Date().toISOString(),
          provider: usageRow.provider,
          model: usageRow.model,
          category: 'health',
          productId: 'llm-health-check',
          runId,
          round: 0,
          prompt_tokens: usageRow.prompt_tokens || 0,
          completion_tokens: usageRow.completion_tokens || 0,
          cached_prompt_tokens: usageRow.cached_prompt_tokens || 0,
          total_tokens: usageRow.total_tokens || 0,
          cost_usd: usageRow.cost_usd || 0,
          reason: 'health',
          host: '',
          url_count: 0,
          evidence_chars: 0,
          estimated_usage: Boolean(usageRow.estimated_usage),
          meta: {
            retry_without_schema: Boolean(usageRow.retry_without_schema),
            deepseek_mode_detected: Boolean(usageRow.deepseek_mode_detected),
            json_schema_requested: Boolean(usageRow.json_schema_requested),
            response_format_fallback: Boolean(usageRow.retry_without_schema)
          }
        }
      });
    },
    reasoningMode: configBool(config, 'llmReasoningMode'),
    reasoningBudget: configInt(config, 'llmReasoningBudget'),
    timeoutMs: configInt(config, 'llmTimeoutMs'),
    logger
  });

  const parsedOk = Boolean(response && typeof response === 'object');
  const jsonValid = parsedOk &&
    typeof response.ok === 'boolean' &&
    typeof response.provider === 'string' &&
    typeof response.model === 'string' &&
    typeof response.echo === 'string' &&
    typeof response.reasoning_used === 'boolean';

  return {
    ts: new Date().toISOString(),
    run_id: runId,
    provider_resolved: usage.provider || resolvedProvider,
    base_url: resolvedBaseUrl,
    model: usage.model || resolvedModel,
    reasoning_mode: configBool(config, 'llmReasoningMode'),
    reasoning_budget: configInt(config, 'llmReasoningBudget'),
    json_schema_requested: Boolean(usage.json_schema_requested),
    retry_without_schema: Boolean(usage.retry_without_schema),
    deepseek_mode_detected: Boolean(usage.deepseek_mode_detected),
    prompt_tokens: Number(usage.prompt_tokens || 0),
    completion_tokens: Number(usage.completion_tokens || 0),
    total_tokens: Number(usage.total_tokens || 0),
    estimated_usage: Boolean(usage.estimated_usage),
    cost_usd: Number(usage.cost_usd || 0),
    response_ok: Boolean(response?.ok),
    response_json_valid: Boolean(jsonValid),
    response_echo: String(response?.echo || ''),
    response: response || {}
  };
}
