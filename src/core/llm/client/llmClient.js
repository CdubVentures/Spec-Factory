import {
  computeLlmCostUsd,
  estimateTokensFromText,
  normalizeUsage
} from '../../../billing/costRates.js';
import { selectLlmProvider } from '../providers/index.js';
import { providerFromModelToken } from '../providerMeta.js';
import { LlmProviderHealth } from './providerHealth.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const _providerHealth = new LlmProviderHealth({
  failureThreshold: 5,
  openMs: 60_000
});

export function getProviderHealth() {
  return _providerHealth;
}

function normalizeBaseUrl(value) {
  // WHY: Registry base URLs may already include /v1. Strip it so endpoints
  // don't become /v1/v1/chat/completions.
  return String(value || 'https://api.openai.com').replace(/\/+$/, '').replace(/\/v1$/, '');
}

function normalizeModel(value) {
  return String(value || '').trim().toLowerCase();
}


function shouldRetryWithoutJsonSchema(error) {
  const token = String(error?.message || '').toLowerCase();
  return (
    token.includes('response_format') ||
    token.includes('json_schema') ||
    token.includes('unsupported') ||
    token.includes('invalid parameter') ||
    token.includes('invalid_request_error')
  );
}

function shouldCountAsProviderFailure(error) {
  const token = String(error?.message || '').toLowerCase();
  if (!token) {
    return true;
  }
  if (
    token.includes('structured output failed schema validation') ||
    token.includes('content was not valid json') ||
    token.includes('response missing message content') ||
    token.includes('llm_api_key is not configured') ||
    token.includes('response.text is not a function')
  ) {
    return false;
  }
  return true;
}

function sanitizeText(message, secrets = []) {
  let output = String(message || '');
  for (const secret of secrets.filter(Boolean)) {
    output = output.split(secret).join('[redacted]');
  }
  return output;
}

function inferImageMimeType(uri = '', fallback = 'image/jpeg') {
  const token = String(uri || '').toLowerCase();
  if (token.endsWith('.jpg') || token.endsWith('.jpeg')) return 'image/jpeg';
  if (token.endsWith('.png')) return 'image/png';
  if (token.endsWith('.webp')) return 'image/webp';
  if (token.endsWith('.gif')) return 'image/gif';
  if (token.endsWith('.bmp')) return 'image/bmp';
  return fallback;
}

function isImageMimeType(mime = '') {
  return String(mime || '').trim().toLowerCase().startsWith('image/');
}

function normalizeUserInput(user) {
  if (user && typeof user === 'object' && !Array.isArray(user)) {
    const text = String(user.text ?? user.prompt ?? user.payload ?? '').trim();
    const rawImages = Array.isArray(user.images) ? user.images : [];
    return {
      text,
      images: rawImages
        .map((row) => ({
          id: String(row?.id || '').trim(),
          file_uri: String(row?.file_uri || row?.uri || row?.url || '').trim(),
          mime_type: String(row?.mime_type || '').trim(),
          caption: String(row?.caption || '').trim()
        }))
        .filter((row) => row.file_uri)
    };
  }
  return {
    text: String(user || ''),
    images: []
  };
}

async function resolveImageUrlForPrompt({
  uri = '',
  mimeType = '',
  maxInlineBytes = 700_000
} = {}) {
  const token = String(uri || '').trim();
  if (!token) return null;
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (normalizedMime && !isImageMimeType(normalizedMime)) {
    return null;
  }
  if (/^https?:\/\//i.test(token) || token.startsWith('data:')) {
    if (token.startsWith('data:')) {
      const mimeMatch = token.match(/^data:([^;,]+)[;,]/i);
      const dataMime = String(mimeMatch?.[1] || '').trim().toLowerCase();
      if (dataMime && !isImageMimeType(dataMime)) {
        return null;
      }
    }
    return token;
  }
  if (/^(s3|gs):\/\//i.test(token)) {
    return null;
  }
  const localCandidates = [token];
  if (!path.isAbsolute(token) && token.includes('/')) {
    const outputRoot = String(process.env.LOCAL_OUTPUT_ROOT || 'out').trim() || 'out';
    localCandidates.push(path.resolve(outputRoot, ...token.split('/')));
    const inputRoot = String(process.env.LOCAL_INPUT_ROOT || '.workspace').trim() || '.workspace';
    localCandidates.push(path.resolve(inputRoot, ...token.split('/')));
  }
  for (const candidatePath of localCandidates) {
    try {
      const buffer = await fs.readFile(candidatePath);
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) continue;
      if (buffer.length > Math.max(64_000, Number(maxInlineBytes || 700_000))) {
        continue;
      }
      const effectiveMime = mimeType || inferImageMimeType(candidatePath);
      return `data:${effectiveMime};base64,${buffer.toString('base64')}`;
    } catch {
      // try next local candidate
    }
  }
  return null;
}

async function buildUserMessageContent({
  user,
  usageContext = {}
} = {}) {
  const normalized = normalizeUserInput(user);
  const text = normalized.text || '';
  const maxImages = Math.max(0, Number.parseInt(String(usageContext?.multimodal_max_images || 6), 10) || 6);
  const maxInlineBytes = Math.max(64_000, Number.parseInt(String(usageContext?.multimodal_max_inline_bytes || 700_000), 10) || 700_000);
  const images = [];
  const imageSources = [];
  const imageDebug = [];
  for (const image of normalized.images.slice(0, maxImages)) {
    const effectiveMime = String(image.mime_type || inferImageMimeType(image.file_uri, 'image/jpeg')).trim();
    if (!isImageMimeType(effectiveMime)) {
      imageDebug.push({
        file_uri: image.file_uri,
        mime_type: effectiveMime,
        resolved: false,
        skipped_reason: 'unsupported_mime'
      });
      continue;
    }
    const resolved = await resolveImageUrlForPrompt({
      uri: image.file_uri,
      mimeType: effectiveMime,
      maxInlineBytes
    });
    imageDebug.push({
      file_uri: image.file_uri,
      mime_type: effectiveMime,
      resolved: Boolean(resolved)
    });
    if (!resolved) {
      continue;
    }
    images.push({
      type: 'image_url',
      image_url: {
        url: resolved
      }
    });
    imageSources.push({
      id: image.id || '',
      file_uri: image.file_uri,
      mime_type: effectiveMime,
      caption: image.caption || ''
    });
  }
  if (images.length === 0) {
    return {
      content: text,
      text,
      imageCount: 0,
      imageSources,
      imageDebug
    };
  }
  const content = [
    { type: 'text', text },
    ...images
  ];
  return {
    content,
    text,
    imageCount: images.length,
    imageSources,
    imageDebug
  };
}

function extractMessageContent(message) {
  if (!message) {
    return '';
  }
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((item) => item && item.type === 'text')
      .map((item) => item.text || '')
      .join('\n');
  }
  return '';
}

function extractJsonCandidate(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return '';
  }

  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  const startIndexes = [];
  const objectStart = raw.indexOf('{');
  const arrayStart = raw.indexOf('[');
  if (objectStart >= 0) {
    startIndexes.push(objectStart);
  }
  if (arrayStart >= 0) {
    startIndexes.push(arrayStart);
  }
  if (!startIndexes.length) {
    return raw;
  }

  const start = Math.min(...startIndexes);
  const openChar = raw[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === openChar) {
      depth += 1;
      continue;
    }
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }

  return raw;
}

function stripThinkTags(text) {
  const raw = String(text || '');
  if (!raw) return '';
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractBalancedJsonSegments(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const segments = [];
  for (let start = 0; start < raw.length; start += 1) {
    const open = raw[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let i = start; i < raw.length; i += 1) {
      const ch = raw[i];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (ch === '\\') {
          escaping = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === open) {
        depth += 1;
        continue;
      }
      if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          segments.push(raw.slice(start, i + 1).trim());
          start = i;
          break;
        }
      }
    }
  }
  return segments;
}

function scoreParsedJsonSignal(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + 1 + scoreParsedJsonSignal(entry), 0);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce(
      (sum, [key, entry]) => sum + 1 + (String(key || '').trim() ? 1 : 0) + scoreParsedJsonSignal(entry),
      0
    );
  }
  if (typeof value === 'string') {
    return String(value).trim() ? 1 : 0;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return 1;
  }
  return 0;
}

function parseJsonContent(content) {
  const direct = String(content || '').trim();
  if (!direct) {
    return null;
  }
  try {
    return JSON.parse(direct);
  } catch {
    // continue with relaxed extraction
  }

  const candidates = [];
  const pushCandidate = (value) => {
    const token = String(value || '').trim();
    if (token && !candidates.includes(token)) {
      candidates.push(token);
    }
  };
  pushCandidate(stripThinkTags(direct));
  pushCandidate(extractJsonCandidate(direct));
  for (const segment of extractBalancedJsonSegments(direct)) {
    pushCandidate(segment);
  }
  let bestParsed = null;
  let bestScore = -1;
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const parsed = JSON.parse(candidates[i]);
      const score = scoreParsedJsonSignal(parsed);
      if (score > bestScore) {
        bestParsed = parsed;
        bestScore = score;
      }
    } catch {
      // continue
    }
  }
  return bestParsed;
}

function resolveModelTokenProfile(profileMap = {}, model = '') {
  const token = normalizeModel(model);
  if (!token || !profileMap || typeof profileMap !== 'object') {
    return { defaultOutputTokens: 0, maxOutputTokens: 0 };
  }
  let selected = null;
  let selectedKey = '';
  for (const [rawModel, rawProfile] of Object.entries(profileMap || {})) {
    const key = normalizeModel(rawModel);
    if (!key || !rawProfile || typeof rawProfile !== 'object') continue;
    const matches = token === key || token.startsWith(key) || key.startsWith(token);
    if (!matches) continue;
    if (!selected || key.length > selectedKey.length) {
      selected = rawProfile;
      selectedKey = key;
    }
  }
  if (!selected) {
    return { defaultOutputTokens: 0, maxOutputTokens: 0 };
  }
  const defaultOutputTokens = Number.parseInt(String(
    selected.defaultOutputTokens
    ?? selected.default_output_tokens
    ?? selected.default
    ?? 0
  ), 10);
  const maxOutputTokens = Number.parseInt(String(
    selected.maxOutputTokens
    ?? selected.max_output_tokens
    ?? selected.max
    ?? selected.maximum
    ?? 0
  ), 10);
  return {
    defaultOutputTokens: Number.isFinite(defaultOutputTokens) ? Math.max(0, defaultOutputTokens) : 0,
    maxOutputTokens: Number.isFinite(maxOutputTokens) ? Math.max(0, maxOutputTokens) : 0
  };
}

function resolveEffectiveMaxTokens({
  model = '',
  deepSeekMode = false,
  reasoningMode = false,
  reasoningBudget = 0,
  maxTokens = 0,
  usageContext = {}
} = {}) {
  const profile = resolveModelTokenProfile(usageContext?.model_token_profile_map || {}, model);
  const defaultCap = Number.parseInt(String(usageContext?.default_output_token_cap || 0), 10);
  let requested = 0;
  if (reasoningMode && Number(reasoningBudget || 0) > 0) {
    requested = Number(reasoningBudget || 0);
  } else if (Number(maxTokens || 0) > 0) {
    requested = Number(maxTokens || 0);
  } else if (Number(profile.defaultOutputTokens || 0) > 0) {
    requested = Number(profile.defaultOutputTokens || 0);
  } else if (Number(defaultCap || 0) > 0) {
    requested = Number(defaultCap || 0);
  }
  let capped = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0;
  const modelMax = Number(profile.maxOutputTokens || 0);
  if (modelMax > 0) {
    capped = Math.min(capped || modelMax, modelMax);
  }
  if (deepSeekMode) {
    const deepSeekCap = Number.parseInt(String(usageContext?.deepseek_default_max_output_tokens || 8192), 10);
    if (Number.isFinite(deepSeekCap) && deepSeekCap > 0) {
      capped = Math.min(capped || deepSeekCap, deepSeekCap);
    }
  }
  if (capped > 0 && capped < 128) {
    capped = 128;
  }
  return capped;
}

function validateParsedShape(parsed, schema) {
  if (!schema || parsed === null || parsed === undefined) {
    return { valid: parsed !== null && parsed !== undefined, errors: [] };
  }
  const errors = [];
  if (schema.type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    errors.push(`expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
  }
  if (schema.type === 'array' && !Array.isArray(parsed)) {
    errors.push(`expected array, got ${typeof parsed}`);
  }
  if (schema.type === 'object' && Array.isArray(schema.required) && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const key of schema.required) {
      if (parsed[key] === undefined) {
        errors.push(`missing required key: ${key}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

async function requestChatCompletion({
  providerClient,
  baseUrl,
  apiKey,
  body,
  signal,
  onStreamChunk,
}) {
  const parsedBody = await providerClient.request({
    baseUrl,
    apiKey,
    body,
    signal,
    onDelta: onStreamChunk,
  });

  const message = parsedBody?.choices?.[0]?.message;
  const content = extractMessageContent(message);
  if (!content) {
    throw new Error('OpenAI API response missing message content');
  }

  return {
    message,
    content,
    usage: parsedBody?.usage || {},
    responseModel: parsedBody?.model || ''
  };
}

export function redactOpenAiError(message, apiKey) {
  return sanitizeText(message, [apiKey]);
}

export async function callLlmProvider({
  // Route (from resolver) — grouped so adding new route fields is one place
  route = {},
  // Backward compat: flat params still accepted, route takes precedence
  model: flatModel, apiKey: flatApiKey, baseUrl: flatBaseUrl,
  provider: flatProvider, accessMode: flatAccessMode,
  // Content
  system, user, jsonSchema,
  // Options
  requestOptions = null,
  reasoningMode = false,
  reasoningBudget = 0,
  maxTokens = 0,
  // WHY: Phase-level input context window cap (from LLM panel). 0 = unlimited
  // (model hardware max applies). Surfaced via usageContext.max_context_tokens
  // for provider adapters and telemetry; no runtime clamp applied here yet.
  maxContextTokens = 0,
  timeoutMs = 40_000,
  // WHY: When true, return raw content string instead of parsed JSON.
  // Used by two-phase routing (jsonStrict=false) for the research phase.
  rawTextMode = false,
  // Infrastructure
  costRates,
  usageContext = {},
  onUsage,
  providerHealth,
  logger,
  onStreamChunk,
  // WHY: External abort signal from operation cancellation. Combined with
  // the internal timeout controller so both cancellation and timeout work.
  signal: externalSignal,
}) {
  const model = route.model || flatModel || '';
  const apiKey = route.apiKey || flatApiKey || '';
  const baseUrl = route.baseUrl || flatBaseUrl || '';
  const provider = route.provider || flatProvider || '';
  const accessMode = route.accessMode || flatAccessMode || '';

  if (!apiKey) {
    throw new Error('No API key configured — set a provider API key in the registry');
  }

  const baseUrlNormalized = normalizeBaseUrl(baseUrl);
  const inferredProvider = provider || providerFromModelToken(model);
  const providerClient = selectLlmProvider(inferredProvider);
  const isLab = accessMode === 'lab';
  const inferredName = providerFromModelToken(model) || providerClient.name;
  const providerLabel = isLab ? `lab-${inferredName}` : inferredName;
  const health = providerHealth || _providerHealth;
  // WHY: Registry-routed calls pass the provider TYPE ("openai-compatible"), not
  // the provider NAME ("deepseek"), so the legacy `inferredProvider === 'deepseek'`
  // check never fired for registry-routed DeepSeek and strict json_schema was sent
  // instead of DeepSeek's native json_object mode. Detect via the model token,
  // gated on !isLab so lab proxies keep using their request_options.json_mode path.
  const deepSeekMode = !isLab && providerFromModelToken(model) === 'deepseek';
  const reason = String(usageContext?.reason || '').trim();
  const routeRole = String(usageContext?.route_role || '').trim();
  const jsonSchemaRequested = Boolean(jsonSchema && !deepSeekMode);
  const forceJsonOutput = Boolean(jsonSchema && deepSeekMode);
  const effectiveSystem = [
    String(system || ''),
    reasoningMode ? 'Use deliberate internal reasoning before finalizing output.' : '',
    forceJsonOutput ? 'Return strict JSON only. Do not include markdown or explanations.' : ''
  ]
    .filter(Boolean)
    .join('\n');
  // WHY: When disableLimits is on, routing sends maxTokens=0 AND reasoningBudget=0.
  // Skip resolveEffectiveMaxTokens entirely so the fallback chain doesn't re-impose
  // a cap from defaultCap or profile. The model's hardware max applies instead.
  const _noLimitRequested = Number(maxTokens || 0) === 0 && Number(reasoningBudget || 0) === 0;
  const effectiveMaxTokens = _noLimitRequested
    ? 0
    : resolveEffectiveMaxTokens({
        model,
        deepSeekMode,
        reasoningMode: Boolean(reasoningMode),
        reasoningBudget: Number(reasoningBudget || 0),
        maxTokens: Number(maxTokens || 0),
        usageContext
      });
  const userMessage = await buildUserMessageContent({
    user,
    usageContext
  });
  let promptPreview = '';
  try {
    const promptPayload = {
        system: String(effectiveSystem || '').slice(0, 2000),
        user: String(userMessage.text || '').slice(0, 10_000),
        multimodal_image_count: userMessage.imageCount,
        images: userMessage.imageSources
      };
    promptPreview = JSON.stringify(promptPayload).slice(0, 8000);
  } catch {
    promptPreview = '';
  }

  // WHY: Shared telemetry context — computed once, spread into all logger events.
  // Adding a new field here auto-propagates to all 4 event types.
  const callContext = Object.freeze({
    reason,
    route_role: routeRole,
    provider: providerLabel,
    access_mode: isLab ? 'lab' : 'api',
    model,
    base_url: baseUrlNormalized,
    endpoint: `${baseUrlNormalized}/v1/chat/completions`,
    deepseek_mode_detected: Boolean(deepSeekMode),
    json_schema_requested: Boolean(jsonSchemaRequested),
    multimodal_image_count: Number(userMessage.imageCount || 0),
  });

  const buildBody = ({ useJsonSchema }) => {
    // WHY: Gemini Code Assist API rejects the 'system' role. Merge system
    // content into the user message as a preamble for Gemini providers.
    const isGeminiProvider = inferredProvider === 'gemini';
    const messages = isGeminiProvider
      ? [{ role: 'user', content: effectiveSystem + '\n\n' + userMessage.content }]
      : [
          { role: 'system', content: effectiveSystem },
          { role: 'user', content: userMessage.content }
        ];
    const body = {
      model,
      temperature: 0,
      messages,
    };

    if (effectiveMaxTokens > 0) {
      body.max_tokens = effectiveMaxTokens;
    }

    if (useJsonSchema && jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          strict: true,
          schema: jsonSchema
        }
      };
    }
    // WHY: Lab proxies (browser-based) ignore response_format but honor json_mode
    // in request_options. Only inject request_options for lab calls — public APIs
    // (Gemini, DeepSeek) reject unknown fields like request_options.
    const labCall = isLab;
    if (requestOptions && typeof requestOptions === 'object') {
      body.request_options = labCall && useJsonSchema && jsonSchema
        ? { ...requestOptions, json_mode: true }
        : requestOptions;
    } else if (labCall && useJsonSchema && jsonSchema) {
      body.request_options = { json_mode: true };
    }

    return body;
  };

  const parseStructuredResult = (content, { fallbackExtraction = false } = {}) => {
    const parsed = parseJsonContent(content);
    if (parsed === null) {
      throw new Error('OpenAI API content was not valid JSON');
    }
    if (jsonSchema) {
      const schemaToValidate = jsonSchema?.schema || jsonSchema;
      const validation = validateParsedShape(parsed, schemaToValidate);
      if (!validation.valid) {
        logger?.warn?.('structured_output_shape_mismatch', {
          reason,
          provider: providerLabel,
          model,
          base_url: baseUrlNormalized,
          endpoint: `${baseUrlNormalized}/v1/chat/completions`,
          errors: validation.errors,
          fallback_extraction: Boolean(fallbackExtraction)
        });
        throw new Error('OpenAI API structured output failed schema validation');
      }
    }
    if (fallbackExtraction) {
      logger?.info?.('structured_output_fallback_used', {
        reason,
        provider: providerLabel,
        model
      });
    }
    return parsed;
  };

  const emitFailure = (safeMessage) => {
    logger?.warn?.('llm_call_failed', {
      ...callContext,
      message: safeMessage
    });
  };

  const emitUsage = async ({ usage, content, responseModel, retryWithoutSchema = false, duration_ms = 0 }) => {
    // WHY: sent_tokens is the locally-estimated size of what Spec Factory actually
    // transmitted (system prompt + user message). Distinct from the API's
    // prompt_tokens which includes tool-loop / reasoning-iteration context growth
    // the provider tacks on. Powers the Prompt vs Usage split on the billing panel.
    const sentTokens = estimateTokensFromText(`${effectiveSystem}\n${String(userMessage.text || '')}`);
    const fallbackUsage = {
      promptTokens: sentTokens,
      completionTokens: estimateTokensFromText(content),
      cachedPromptTokens: 0,
      estimated: !usage || Object.keys(usage || {}).length === 0
    };
    const normalizedUsage = normalizeUsage(usage, fallbackUsage);
    const cost = computeLlmCostUsd({
      usage: normalizedUsage,
      rates: costRates || {},
      model: responseModel || model
    });

    const usageSummary = {
      prompt_tokens: normalizedUsage.promptTokens,
      completion_tokens: normalizedUsage.completionTokens,
      total_tokens: normalizedUsage.totalTokens,
      estimated_cost: cost.costUsd
    };

    if (typeof onUsage !== 'function') {
      return usageSummary;
    }

    await onUsage({
      provider: providerLabel,
      model: responseModel || model,
      prompt_tokens: normalizedUsage.promptTokens,
      completion_tokens: normalizedUsage.completionTokens,
      cached_prompt_tokens: normalizedUsage.cachedPromptTokens,
      sent_tokens: sentTokens,
      total_tokens: normalizedUsage.totalTokens,
      cost_usd: cost.costUsd,
      estimated_usage: Boolean(normalizedUsage.estimated),
      retry_without_schema: Boolean(retryWithoutSchema),
      deepseek_mode_detected: Boolean(deepSeekMode),
      json_schema_requested: Boolean(jsonSchemaRequested),
      duration_ms,
      ...usageContext
    });
    logger?.info?.('llm_call_usage', {
      ...callContext,
      purpose: reason,
      model: responseModel || model,
      prompt_tokens: normalizedUsage.promptTokens,
      completion_tokens: normalizedUsage.completionTokens,
      cached_prompt_tokens: normalizedUsage.cachedPromptTokens,
      total_tokens: normalizedUsage.totalTokens,
      cost_usd: cost.costUsd,
      estimated_usage: Boolean(normalizedUsage.estimated),
      retry_without_schema: Boolean(retryWithoutSchema),
    });
    return usageSummary;
  };

  if (!health.canRequest(providerLabel)) {
    const snap = health.snapshot(providerLabel);
    const safeMessage = `Provider '${providerLabel}' circuit open (${snap.failure_count} consecutive failures). Retry after cooldown.`;
    logger?.warn?.('llm_provider_circuit_open', {
      ...callContext,
      failure_count: snap.failure_count,
      state: snap.state,
      open_until_ms: snap.open_until_ms,
    });
    throw new Error(safeMessage);
  }

  logger?.info?.('llm_call_started', {
    ...callContext,
    purpose: reason,
    max_tokens_requested: Math.max(Number(reasoningMode ? reasoningBudget : maxTokens) || 0, 0),
    max_tokens_applied: effectiveMaxTokens,
    multimodal_image_sources: userMessage.imageSources,
    multimodal_image_debug: Array.isArray(userMessage.imageDebug)
      ? userMessage.imageDebug.slice(0, 8)
      : [],
    prompt_preview: promptPreview,
  });

  let controller;
  let timer;
  let callStartMs = 0;
  // WHY: Hoisted so the catch-block retry path (retry-without-schema) can
  // reference it. Declaring inside the try put it out of scope for the catch,
  // crashing any provider (e.g. DeepSeek) that rejects strict json_schema.
  let effectiveSignal;
  try {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    // WHY: Compose external cancel signal with internal timeout so both work.
    effectiveSignal = externalSignal
      ? AbortSignal.any([externalSignal, controller.signal])
      : controller.signal;
    callStartMs = Date.now();
    const useJsonSchema = Boolean(jsonSchemaRequested);
    const firstBody = buildBody({ useJsonSchema });
    const first = await requestChatCompletion({
      providerClient,
      baseUrl: baseUrlNormalized,
      apiKey,
      body: firstBody,
      signal: effectiveSignal,
      onStreamChunk,
    });
    const firstUsage = await emitUsage({
      usage: first.usage,
      content: first.content,
      responseModel: first.responseModel,
      duration_ms: Date.now() - callStartMs,
    });
    if (rawTextMode) return first.content;
    const parsed = parseStructuredResult(first.content);
    health.recordSuccess(providerLabel);
    logger?.info?.('llm_call_completed', {
      ...callContext,
      purpose: reason,
      model: first.responseModel || model,
      retry_without_schema: false,
      prompt_preview: promptPreview,
      response_preview: String(first.content || '').slice(0, 12_000),
      prompt_tokens: firstUsage?.prompt_tokens ?? null,
      completion_tokens: firstUsage?.completion_tokens ?? null,
      total_tokens: firstUsage?.total_tokens ?? null,
      estimated_cost: firstUsage?.estimated_cost ?? null,
      duration_ms: Date.now() - callStartMs,
    });
    return parsed;
  } catch (firstError) {
    if (!jsonSchema || !shouldRetryWithoutJsonSchema(firstError)) {
      if (shouldCountAsProviderFailure(firstError)) {
        health.recordFailure(providerLabel, firstError);
      }
      const causeMsg = firstError.cause?.message ? ` (${firstError.cause.message})` : '';
      const safeMessage = sanitizeText(firstError.message + causeMsg, [apiKey]);
      emitFailure(safeMessage);
      throw new Error(safeMessage);
    }

    try {
      const retryBody = buildBody({ useJsonSchema: false });
      const retry = await requestChatCompletion({
        providerClient,
        baseUrl: baseUrlNormalized,
        apiKey,
        body: retryBody,
        signal: effectiveSignal,
        onStreamChunk,
      });
      const retryUsage = await emitUsage({
        usage: retry.usage,
        content: retry.content,
        responseModel: retry.responseModel,
        retryWithoutSchema: true,
        duration_ms: Date.now() - callStartMs,
      });
      if (rawTextMode) return retry.content;
      const parsed = parseStructuredResult(retry.content, { fallbackExtraction: true });
      health.recordSuccess(providerLabel);
      logger?.info?.('llm_call_completed', {
        ...callContext,
        purpose: reason,
        model: retry.responseModel || model,
        retry_without_schema: true,
        prompt_preview: promptPreview,
        response_preview: String(retry.content || '').slice(0, 12_000),
        prompt_tokens: retryUsage?.prompt_tokens ?? null,
        completion_tokens: retryUsage?.completion_tokens ?? null,
        total_tokens: retryUsage?.total_tokens ?? null,
        estimated_cost: retryUsage?.estimated_cost ?? null,
        duration_ms: Date.now() - callStartMs,
      });
      return parsed;
    } catch (retryError) {
      if (shouldCountAsProviderFailure(retryError)) {
        health.recordFailure(providerLabel, retryError);
      }
      const causeMsg = retryError.cause?.message ? ` (${retryError.cause.message})` : '';
      const safeMessage = sanitizeText(retryError.message + causeMsg, [apiKey]);
      emitFailure(safeMessage);
      throw new Error(safeMessage);
    }
  } finally {
    clearTimeout(timer);
  }
}
