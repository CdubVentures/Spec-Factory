import { callLlmWithRouting, hasLlmRouteApiKey } from './routing.js';

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasMeaningfulValue(value) {
  const token = normalizeToken(value);
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
}

function clamp01(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function dedupeValues(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!hasMeaningfulValue(text)) continue;
    const token = normalizeToken(text);
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(text);
  }
  return output;
}

function inferTemplateFromValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .replace(/\d+(?:[.,]\d+)?/g, 'XXXX')
    .replace(/\(([^)]+)\)/g, '(YYYY)')
    .replace(/\[([^\]]+)\]/g, '[YYYY]')
    .replace(/"[^"]+"/g, '"YYYY"')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferTemplateExamples(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of dedupeValues(values)) {
    const template = inferTemplateFromValue(value);
    if (!template) continue;
    const token = normalizeToken(template);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(template);
    if (out.length >= 4) break;
  }
  return out;
}

function defaultFieldFormatGuidance(fieldKey = '') {
  const token = normalizeToken(fieldKey);
  if (token.includes('lighting')) {
    return 'Preferred template: XXXX zone (YYYY). Example outputs: 1 zone (rgb), 7 zone (led).';
  }
  if (token.includes('feet') && token.includes('material')) {
    return 'Prefer canonical material strings exactly as listed, including punctuation and casing.';
  }
  return '';
}

export function resolveEnumConsistencyFormatGuidance({
  fieldKey = '',
  formatGuidance = '',
  canonicalValues = [],
} = {}) {
  const explicitGuidance = String(formatGuidance ?? '').trim();
  if (explicitGuidance) {
    return explicitGuidance;
  }

  const parts = [];
  const templates = inferTemplateExamples(canonicalValues);
  if (templates.length > 0) {
    parts.push(`Use canonical template(s): ${templates.join(' | ')}.`);
    parts.push('Placeholder convention: XXXX for numeric/count segments and YYYY for variable text segments.');
  }
  const fieldHint = defaultFieldFormatGuidance(fieldKey);
  if (fieldHint) {
    parts.push(fieldHint);
  }
  if (parts.length === 0) {
    return 'Preserve canonical punctuation/casing/token shape from known values.';
  }
  return parts.join(' ');
}

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            decision: { type: 'string', enum: ['map_to_existing', 'keep_new', 'uncertain'] },
            target_value: { type: 'string' },
            reasoning: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['value', 'decision'],
        },
      },
    },
    required: ['decisions'],
  };
}

function defaultUncertainDecision(value) {
  return {
    value,
    decision: 'uncertain',
    target_value: null,
    reasoning: 'no_consistency_decision',
    confidence: 0,
  };
}

export function sanitizeEnumConsistencyDecisions(raw = {}, {
  pendingValues = [],
  canonicalValues = [],
} = {}) {
  const normalizedPending = dedupeValues(pendingValues);
  const pendingByToken = new Map(normalizedPending.map((value) => [normalizeToken(value), value]));
  const canonicalByToken = new Map(dedupeValues(canonicalValues).map((value) => [normalizeToken(value), value]));
  const rows = Array.isArray(raw?.decisions) ? raw.decisions : [];
  const decisionsByToken = new Map();

  for (const row of rows) {
    const valueToken = normalizeToken(row?.value);
    if (!pendingByToken.has(valueToken)) continue;
    if (decisionsByToken.has(valueToken)) continue;

    const requestedDecision = String(row?.decision || '').trim().toLowerCase();
    if (requestedDecision === 'map_to_existing') {
      const targetToken = normalizeToken(row?.target_value);
      if (!canonicalByToken.has(targetToken)) {
        decisionsByToken.set(valueToken, {
          value: pendingByToken.get(valueToken),
          decision: 'uncertain',
          target_value: null,
          reasoning: 'target_not_in_canonical_list',
          confidence: clamp01(row?.confidence, 0),
        });
        continue;
      }
      decisionsByToken.set(valueToken, {
        value: pendingByToken.get(valueToken),
        decision: 'map_to_existing',
        target_value: canonicalByToken.get(targetToken),
        reasoning: String(row?.reasoning || '').trim() || 'mapped_to_existing',
        confidence: clamp01(row?.confidence, 0.8),
      });
      continue;
    }

    if (requestedDecision === 'keep_new') {
      decisionsByToken.set(valueToken, {
        value: pendingByToken.get(valueToken),
        decision: 'keep_new',
        target_value: null,
        reasoning: String(row?.reasoning || '').trim() || 'kept_new_value',
        confidence: clamp01(row?.confidence, 0.8),
      });
      continue;
    }

    decisionsByToken.set(valueToken, {
      value: pendingByToken.get(valueToken),
      decision: 'uncertain',
      target_value: null,
      reasoning: String(row?.reasoning || '').trim() || 'uncertain',
      confidence: clamp01(row?.confidence, 0),
    });
  }

  return normalizedPending.map((value) => {
    const token = normalizeToken(value);
    return decisionsByToken.get(token) || defaultUncertainDecision(value);
  });
}

function buildSystemPrompt(formatGuidance = '') {
  return [
    'You normalize enum value formatting for hardware specs review.',
    'Task scope is formatting consistency only.',
    'Do not invent new semantics or merge meaningfully different values.',
    'Use map_to_existing only when a pending value is the same meaning as an existing canonical value.',
    'Use keep_new when value is valid but truly new and already in proper format.',
    'Use uncertain when evidence is insufficient.',
    'Return JSON only with decisions[].',
    formatGuidance ? `Format guidance: ${formatGuidance}` : '',
  ].filter(Boolean).join('\n');
}

function buildUserPayload({
  fieldKey,
  enumPolicy,
  canonicalValues,
  pendingValues,
}) {
  return JSON.stringify({
    field_key: fieldKey,
    enum_policy: enumPolicy || 'open',
    canonical_values: canonicalValues,
    pending_values: pendingValues,
    instructions: [
      'Prefer exact canonical casing/token style for map_to_existing.',
      'No extra prose.',
      'Only decisions for provided pending_values.',
    ],
  }, null, 2);
}

export async function runEnumConsistencyReview({
  fieldKey,
  enumPolicy = 'open',
  canonicalValues = [],
  pendingValues = [],
  formatGuidance = '',
  config = {},
  logger = null,
} = {}) {
  const normalizedPending = dedupeValues(pendingValues);
  const normalizedCanonical = dedupeValues(canonicalValues);
  const effectiveFormatGuidance = resolveEnumConsistencyFormatGuidance({
    fieldKey,
    formatGuidance,
    canonicalValues: normalizedCanonical,
  });
  if (!normalizedPending.length) {
    return {
      enabled: false,
      skipped_reason: 'no_pending_values',
      format_guidance: effectiveFormatGuidance,
      decisions: [],
    };
  }

  const llmEnabled = Boolean(config?.llmEnabled && hasLlmRouteApiKey(config, { role: 'validate' }));
  if (!llmEnabled) {
    return {
      enabled: false,
      skipped_reason: 'llm_disabled_or_missing_key',
      format_guidance: effectiveFormatGuidance,
      decisions: normalizedPending.map((value) => defaultUncertainDecision(value)),
    };
  }

  try {
    const raw = await callLlmWithRouting({
      config,
      reason: 'validate_enum_consistency',
      role: 'validate',
      system: buildSystemPrompt(effectiveFormatGuidance),
      user: buildUserPayload({
        fieldKey,
        enumPolicy,
        canonicalValues: normalizedCanonical,
        pendingValues: normalizedPending,
      }),
      jsonSchema: responseSchema(),
      usageContext: {
        reason: 'validate_enum_consistency',
        field_key: fieldKey,
        enum_policy: enumPolicy,
        pending_count: normalizedPending.length,
        canonical_count: normalizedCanonical.length,
      },
      reasoningMode: Boolean(config?.llmReasoningMode),
      reasoningBudget: Number(config?.llmReasoningBudget || 0),
      timeoutMs: Number(config?.llmTimeoutMs || config?.openaiTimeoutMs || 40_000),
      logger,
    });

    return {
      enabled: true,
      model: String(config?.llmModelValidate || config?.llmModelExtract || '').trim() || null,
      provider: String(config?.llmValidateProvider || config?.llmProvider || '').trim() || null,
      format_guidance: effectiveFormatGuidance,
      decisions: sanitizeEnumConsistencyDecisions(raw || {}, {
        pendingValues: normalizedPending,
        canonicalValues: normalizedCanonical,
      }),
    };
  } catch (error) {
    logger?.warn?.('enum_consistency_review_failed', {
      field_key: fieldKey,
      message: error?.message || 'unknown_error',
    });
    return {
      enabled: false,
      skipped_reason: 'llm_call_failed',
      format_guidance: effectiveFormatGuidance,
      decisions: normalizedPending.map((value) => defaultUncertainDecision(value)),
    };
  }
}
