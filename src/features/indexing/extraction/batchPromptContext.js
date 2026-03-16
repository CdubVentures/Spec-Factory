import { buildExtractionContextMatrix } from './extractionContext.js';
import {
  ruleRequiredLevel,
  ruleShape,
  ruleType,
  ruleUnit,
  autoGenerateExtractionGuidance
} from '../../../engine/ruleAccessors.js';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function clipText(value, maxChars = 900) {
  const token = String(value || '');
  const cap = Math.max(160, Number.parseInt(String(maxChars || 900), 10) || 900);
  if (token.length <= cap) {
    return token;
  }
  return `${token.slice(0, cap)}...`;
}

function stripBooleanLeaves(value) {
  if (Array.isArray(value)) {
    return value.map((row) => stripBooleanLeaves(row));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'boolean') continue;
    out[key] = stripBooleanLeaves(child);
  }
  return out;
}

function buildPromptEvidencePayload(scoped = {}, config = {}) {
  const maxCharsPerSnippet = Math.max(160, Number.parseInt(String(config.llmExtractMaxSnippetChars || 900), 10) || 900);
  const promptRefs = (scoped.references || []).map((row) => ({
    id: String(row?.id || '').trim(),
    source_id: row?.source_id || row?.source || '',
    url: row?.url || '',
    type: row?.type || 'text',
    snippet_hash: row?.snippet_hash || '',
    file_uri: row?.file_uri || '',
    mime_type: row?.mime_type || '',
    content_hash: row?.content_hash || '',
    surface: row?.surface || ''
  })).filter((row) => row.id);
  const promptSnippets = (scoped.snippets || []).map((row) => ({
    id: String(row?.id || '').trim(),
    source: row?.source || row?.source_id || '',
    source_id: row?.source_id || row?.source || '',
    type: row?.type || 'text',
    field_hints: Array.isArray(row?.field_hints) ? row.field_hints : [],
    text: clipText(row?.normalized_text || row?.text || '', maxCharsPerSnippet),
    snippet_hash: row?.snippet_hash || '',
    url: row?.url || '',
    file_uri: row?.file_uri || '',
    mime_type: row?.mime_type || '',
    content_hash: row?.content_hash || '',
    surface: row?.surface || ''
  })).filter((row) => row.id && row.text);
  return {
    references: promptRefs,
    snippets: promptSnippets
  };
}

function applyRoutePolicyToPromptPayload({
  payload = {},
  routePolicy = {}
} = {}) {
  const next = {
    ...(payload || {})
  };
  const extractionContext = next?.extraction_context && typeof next.extraction_context === 'object'
    ? {
      ...next.extraction_context,
      fields: next.extraction_context.fields && typeof next.extraction_context.fields === 'object'
        ? Object.fromEntries(
          Object.entries(next.extraction_context.fields).map(([fieldKey, fieldValue]) => [
            fieldKey,
            fieldValue && typeof fieldValue === 'object' ? { ...fieldValue } : fieldValue
          ])
        )
        : {}
    }
    : null;

  if (!routePolicy.studio_contract_rules_sent_in_extract_review) {
    next.contracts = {};
  }
  if (!routePolicy.studio_enum_options_sent_when_present) {
    next.enumOptions = {};
  }
  if (!routePolicy.studio_component_entity_set_sent_when_component_field) {
    next.componentRefs = {};
  }

  if (extractionContext && extractionContext.fields && typeof extractionContext.fields === 'object') {
    for (const [fieldKey, fieldContext] of Object.entries(extractionContext.fields)) {
      if (!fieldContext || typeof fieldContext !== 'object') continue;
      const updated = { ...fieldContext };
      if (!routePolicy.studio_key_navigation_sent_in_extract_review) {
        delete updated.field_key;
      }
      if (!routePolicy.studio_contract_rules_sent_in_extract_review) {
        delete updated.contract;
      }
      if (!routePolicy.studio_parse_template_sent_direct_in_extract_review) {
        delete updated.parse_template_intent;
      }
      if (!routePolicy.studio_evidence_policy_sent_direct_in_extract_review) {
        delete updated.evidence_policy;
      }
      if (!routePolicy.studio_required_level_sent_in_extract_review) {
        delete updated.required_level;
      }
      if (!routePolicy.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review) {
        delete updated.ai_mode;
        delete updated.ai_reasoning_note;
        delete updated.difficulty;
        delete updated.availability;
        delete updated.effort;
      }
      if (!routePolicy.studio_tooltip_or_description_sent_when_present) {
        delete updated.ui;
      }
      if (!routePolicy.studio_enum_options_sent_when_present) {
        delete updated.enum_options;
      }
      if (!routePolicy.studio_component_entity_set_sent_when_component_field) {
        delete updated.component_ref;
      }
      if (!routePolicy.studio_variance_policy_sent_in_component_review) {
        if (updated.contract && typeof updated.contract === 'object') {
          delete updated.contract.range;
        }
      }
      if (!routePolicy.studio_constraints_sent_in_component_review) {
        if (updated.contract && typeof updated.contract === 'object') {
          delete updated.contract.list_rules;
        }
      }
      if (!routePolicy.studio_extraction_guidance_sent_in_extract_review && updated.contract && typeof updated.contract === 'object') {
        delete updated.contract.extraction_guidance;
      }
      if (!routePolicy.studio_tooltip_or_description_sent_when_present && updated.contract && typeof updated.contract === 'object') {
        delete updated.contract.description;
      }
      extractionContext.fields[fieldKey] = updated;
    }
  }
  if (extractionContext) {
    next.extraction_context = extractionContext;
  }
  if (!routePolicy.studio_send_booleans_prompted_to_model) {
    return stripBooleanLeaves(next);
  }
  return next;
}

export function buildPromptFieldContracts(categoryConfig = {}, fields = [], componentDBs = {}, knownValuesMap = {}) {
  const ruleMap = categoryConfig?.fieldRules?.fields || {};
  const contracts = {};
  const enumOptions = {};
  const componentRefs = {};

  for (const field of fields || []) {
    const rule = ruleMap[field];
    if (!rule || typeof rule !== 'object') {
      continue;
    }
    const guidance = autoGenerateExtractionGuidance(rule, field);
    const compactGuidance = guidance
      ? String(guidance)
        .split('.')
        .slice(0, 2)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .join('. ')
      : '';
    contracts[field] = {
      description: rule.description || rule.tooltip_md || '',
      data_type: ruleType(rule),
      output_shape: ruleShape(rule),
      required_level: ruleRequiredLevel(rule),
      unit: ruleUnit(rule),
      unknown_reason: rule?.unknown_reason || null,
      ...(compactGuidance ? { extraction_guidance: compactGuidance } : {})
    };

    const enumValues = [
      ...toArray(rule?.enum),
      ...toArray(rule?.contract?.enum),
      ...toArray(rule?.validate?.enum)
    ]
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return String(entry.canonical || entry.value || '').trim();
        }
        return String(entry || '').trim();
      })
      .filter(Boolean);
    const kvValues = toArray(knownValuesMap[field]);
    for (const value of kvValues) {
      const token = String(value || '').trim();
      if (token) {
        enumValues.push(token);
      }
    }
    if (enumValues.length > 0) {
      enumOptions[field] = [...new Set(enumValues)];
    }

    const componentDbRef = String(rule?.component_db_ref || rule?.component?.type || '').trim();
    if (componentDbRef) {
      const dbKey = componentDbRef.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const db = componentDBs[dbKey];
      const entityNames = db?.entries ? Object.values(db.entries).map((entry) => entry.canonical_name).filter(Boolean).sort() : [];
      componentRefs[field] = {
        type: componentDbRef,
        known_entities: entityNames.slice(0, 200)
      };
    }
  }

  return {
    contracts,
    enumOptions,
    componentRefs
  };
}

export function prepareBatchPromptContext({
  job = {},
  categoryConfig = {},
  batchFields = [],
  scopedEvidencePack = {},
  batchRoutePolicy = {},
  config = {},
  componentDBs = {},
  knownValuesMap = {},
  goldenExamples = [],
  contextOptions = {}
} = {}) {
  const effectiveBatchFields = (batchFields || []).map((field) => String(field || '').trim()).filter(Boolean);
  const validRefs = new Set(
    (scopedEvidencePack?.references || []).map((item) => String(item?.id || '').trim()).filter(Boolean)
  );
  const fieldSet = new Set(effectiveBatchFields);
  const contextMatrix = buildExtractionContextMatrix({
    category: job.category || categoryConfig.category || '',
    categoryConfig,
    fields: effectiveBatchFields,
    componentDBs,
    knownValuesMap,
    evidencePack: scopedEvidencePack,
    options: contextOptions
  });
  const routeMinRefsFloor = Math.max(
    1,
    Number.parseInt(
      String(
        batchRoutePolicy?.min_evidence_refs_effective
        ?? batchRoutePolicy?.llm_output_min_evidence_refs_required
        ?? 1
      ),
      10
    ) || 1
  );
  const minEvidenceRefsByField = {};
  for (const field of effectiveBatchFields) {
    const fieldMinRefs = Number(contextMatrix?.fields?.[field]?.evidence_policy?.min_evidence_refs || 1);
    minEvidenceRefsByField[field] = Math.max(1, fieldMinRefs, routeMinRefsFloor);
  }
  const promptEvidence = buildPromptEvidencePayload(scopedEvidencePack, config);
  const userPayloadRaw = {
    product: {
      productId: job.productId,
      brand: job.identityLock?.brand || '',
      model: job.identityLock?.model || '',
      variant: job.identityLock?.variant || '',
      category: job.category || 'mouse'
    },
    targetFields: effectiveBatchFields,
    ...buildPromptFieldContracts(categoryConfig, effectiveBatchFields, componentDBs, knownValuesMap),
    anchors: job.anchors || {},
    golden_examples: (goldenExamples || []).slice(0, 5),
    extraction_context: {
      summary: contextMatrix.summary || {},
      fields: contextMatrix.fields || {},
      prime_sources: contextMatrix?.prime_sources || { by_field: {}, rows: [] }
    },
    references: promptEvidence.references,
    snippets: promptEvidence.snippets
  };
  const userPayload = applyRoutePolicyToPromptPayload({
    payload: userPayloadRaw,
    routePolicy: batchRoutePolicy
  });

  return {
    batchFields: effectiveBatchFields,
    validRefs,
    fieldSet,
    contextMatrix,
    minEvidenceRefsByField,
    promptEvidence,
    userPayload
  };
}
