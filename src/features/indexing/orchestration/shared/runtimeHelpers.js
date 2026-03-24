import { toInt, toBool } from './typeHelpers.js';
import { configValue } from '../../../../shared/settingsAccessor.js';

export function parseMinEvidenceRefs(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return Math.max(1, Number.parseInt(String(fallback || 1), 10) || 1);
  }
  return Math.max(1, parsed);
}

export function sendModeIncludesPrime(value = '') {
  const token = String(value || '').trim().toLowerCase();
  return token.includes('prime');
}

function normalizeToken(value, fallback = '') {
  const token = String(value || '').trim().toLowerCase();
  return token || fallback;
}

function normalizeScopeToken(value) {
  const token = normalizeToken(value, 'field');
  if (token === 'component' || token === 'list' || token === 'field') {
    return token;
  }
  return 'field';
}

function parseEffort(value, fallback = 3) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, parsed));
}

function parseTokenCap(value, fallback = 4096) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(256, Math.min(65536, parsed));
}

function normalizeRoutePolicyRow(row = {}, scopeFallback = 'field') {
  const scope = normalizeScopeToken(row?.scope || scopeFallback);
  const requiredLevel = normalizeToken(row?.required_level, 'expected');
  const difficulty = normalizeToken(row?.difficulty, 'medium');
  const availability = normalizeToken(row?.availability, 'expected');
  const effort = parseEffort(row?.effort, 3);
  const minEvidenceRefs = parseMinEvidenceRefs(row?.llm_output_min_evidence_refs_required, 1);
  return {
    ...row,
    scope,
    route_key: String(row?.route_key || '').trim(),
    required_level: requiredLevel,
    difficulty,
    availability,
    effort,
    single_source_data: toBool(row?.single_source_data, true),
    all_source_data: toBool(row?.all_source_data, false),
    enable_websearch: toBool(row?.enable_websearch, true),
    model_ladder_today: String(row?.model_ladder_today || '').trim(),
    all_sources_confidence_repatch: toBool(row?.all_sources_confidence_repatch, true),
    max_tokens: parseTokenCap(row?.max_tokens, 4096),
    studio_key_navigation_sent_in_extract_review: toBool(row?.studio_key_navigation_sent_in_extract_review, true),
    studio_contract_rules_sent_in_extract_review: toBool(row?.studio_contract_rules_sent_in_extract_review, true),
    studio_extraction_guidance_sent_in_extract_review: toBool(row?.studio_extraction_guidance_sent_in_extract_review, true),
    studio_tooltip_or_description_sent_when_present: toBool(row?.studio_tooltip_or_description_sent_when_present, true),
    studio_enum_options_sent_when_present: toBool(row?.studio_enum_options_sent_when_present, true),
    studio_component_variance_constraints_sent_in_component_review: toBool(row?.studio_component_variance_constraints_sent_in_component_review, scope === 'component'),
    studio_parse_template_sent_direct_in_extract_review: toBool(row?.studio_parse_template_sent_direct_in_extract_review, true),
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: toBool(row?.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review, true),
    studio_required_level_sent_in_extract_review: toBool(row?.studio_required_level_sent_in_extract_review, true),
    studio_component_entity_set_sent_when_component_field: toBool(row?.studio_component_entity_set_sent_when_component_field, scope === 'component'),
    studio_evidence_policy_sent_direct_in_extract_review: toBool(row?.studio_evidence_policy_sent_direct_in_extract_review, true),
    studio_variance_policy_sent_in_component_review: toBool(row?.studio_variance_policy_sent_in_component_review, scope === 'component'),
    studio_constraints_sent_in_component_review: toBool(row?.studio_constraints_sent_in_component_review, scope === 'component'),
    studio_send_booleans_prompted_to_model: toBool(row?.studio_send_booleans_prompted_to_model, false),
    scalar_linked_send: String(row?.scalar_linked_send || 'scalar value + prime sources').trim(),
    component_values_send: String(row?.component_values_send || 'component values + prime sources').trim(),
    list_values_send: String(row?.list_values_send || 'list values prime sources').trim(),
    llm_output_min_evidence_refs_required: minEvidenceRefs,
    insufficient_evidence_action: String(row?.insufficient_evidence_action || 'threshold_unmet').trim() || 'threshold_unmet'
  };
}

function readRuleToken(rule, key, fallback) {
  const direct = normalizeToken(rule?.[key], '');
  if (direct) return direct;
  const fromPriority = normalizeToken(rule?.priority?.[key], '');
  if (fromPriority) return fromPriority;
  return fallback;
}

function readRuleEffort(rule) {
  const direct = Number.parseInt(String(rule?.effort ?? ''), 10);
  if (Number.isFinite(direct)) {
    return parseEffort(direct, 3);
  }
  const fromPriority = Number.parseInt(String(rule?.priority?.effort ?? ''), 10);
  if (Number.isFinite(fromPriority)) {
    return parseEffort(fromPriority, 3);
  }
  return 3;
}

function scoreRouteRowForField(row, target = {}) {
  let score = 0;
  if (row.required_level === target.required_level) score += 100;
  if (row.difficulty === target.difficulty) score += 60;
  if (row.availability === target.availability) score += 40;
  score -= Math.abs(Number(row.effort || 3) - Number(target.effort || 3));
  return score;
}

function selectRouteRowForField(rows = [], target = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const ranked = rows
    .map((row) => ({
      row,
      score: scoreRouteRowForField(row, target)
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const effortA = Number(a.row?.effort || 0);
      const effortB = Number(b.row?.effort || 0);
      if (effortA !== effortB) return effortB - effortA;
      const minA = parseMinEvidenceRefs(a.row?.llm_output_min_evidence_refs_required, 1);
      const minB = parseMinEvidenceRefs(b.row?.llm_output_min_evidence_refs_required, 1);
      return minB - minA;
    });
  return ranked[0]?.row || null;
}

export function selectPreferredRouteRow(rows = [], scope = 'field') {
  const scoped = (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.scope || '').trim().toLowerCase() === String(scope || '').trim().toLowerCase());
  if (scoped.length === 0) {
    return null;
  }
  return scoped
    .slice()
    .sort((a, b) => {
      const effortA = Number.parseInt(String(a?.effort ?? 0), 10) || 0;
      const effortB = Number.parseInt(String(b?.effort ?? 0), 10) || 0;
      if (effortA !== effortB) return effortB - effortA;
      const minA = parseMinEvidenceRefs(a?.llm_output_min_evidence_refs_required, 1);
      const minB = parseMinEvidenceRefs(b?.llm_output_min_evidence_refs_required, 1);
      return minB - minA;
    })[0] || null;
}

export function deriveRouteMatrixPolicy({
  routeRows = [],
  categoryConfig = null
} = {}) {
  const normalizedRows = (Array.isArray(routeRows) ? routeRows : []).map((row) => normalizeRoutePolicyRow(row));
  const fieldRows = normalizedRows.filter((row) => row.scope === 'field');
  const preferredField = selectPreferredRouteRow(fieldRows, 'field');
  const preferredComponent = selectPreferredRouteRow(normalizedRows, 'component');
  const preferredList = selectPreferredRouteRow(normalizedRows, 'list');
  const ruleMinRefs = [];
  const fieldRules = categoryConfig?.fieldRules?.fields || {};
  const fieldPolicyByKey = {};
  for (const [fieldKey, rawRule] of Object.entries(fieldRules || {})) {
    if (!rawRule || typeof rawRule !== 'object') continue;
    const target = {
      required_level: readRuleToken(rawRule, 'required_level', 'expected'),
      difficulty: readRuleToken(rawRule, 'difficulty', 'medium'),
      availability: readRuleToken(rawRule, 'availability', 'expected'),
      effort: readRuleEffort(rawRule)
    };
    const matched = selectRouteRowForField(fieldRows, target);
    if (!matched) continue;
    fieldPolicyByKey[String(fieldKey || '').trim()] = matched;
  }
  for (const rule of Object.values(fieldRules || {})) {
    if (!rule || typeof rule !== 'object') continue;
    ruleMinRefs.push(parseMinEvidenceRefs(rule?.evidence?.min_evidence_refs ?? rule?.min_evidence_refs ?? 1, 1));
  }
  const routeMinRefs = normalizedRows
    .map((row) => parseMinEvidenceRefs(row?.llm_output_min_evidence_refs_required, 1));
  const minEvidenceRefsEffective = Math.max(
    1,
    ...ruleMinRefs,
    ...routeMinRefs
  );
  const scalarSend = String(
    preferredField?.scalar_linked_send || 'scalar value + prime sources'
  ).trim();
  const componentSend = String(
    preferredComponent?.component_values_send || 'component values + prime sources'
  ).trim();
  const listSend = String(
    preferredList?.list_values_send || 'list values prime sources'
  ).trim();
  const primeVisualSend =
    sendModeIncludesPrime(scalarSend) ||
    sendModeIncludesPrime(componentSend) ||
    sendModeIncludesPrime(listSend);
  const preferredFieldPolicy = preferredField || normalizeRoutePolicyRow({ scope: 'field' });

  return {
    route_key: preferredFieldPolicy.route_key || null,
    scalar_linked_send: scalarSend,
    component_values_send: componentSend,
    list_values_send: listSend,
    single_source_data: Boolean(preferredFieldPolicy.single_source_data),
    all_source_data: Boolean(preferredFieldPolicy.all_source_data),
    enable_websearch: Boolean(preferredFieldPolicy.enable_websearch),
    model_ladder_today: String(preferredFieldPolicy.model_ladder_today || '').trim(),
    all_sources_confidence_repatch: Boolean(preferredFieldPolicy.all_sources_confidence_repatch),
    max_tokens: Number(preferredFieldPolicy.max_tokens || 4096),
    studio_key_navigation_sent_in_extract_review: Boolean(preferredFieldPolicy.studio_key_navigation_sent_in_extract_review),
    studio_contract_rules_sent_in_extract_review: Boolean(preferredFieldPolicy.studio_contract_rules_sent_in_extract_review),
    studio_extraction_guidance_sent_in_extract_review: Boolean(preferredFieldPolicy.studio_extraction_guidance_sent_in_extract_review),
    studio_tooltip_or_description_sent_when_present: Boolean(preferredFieldPolicy.studio_tooltip_or_description_sent_when_present),
    studio_enum_options_sent_when_present: Boolean(preferredFieldPolicy.studio_enum_options_sent_when_present),
    studio_component_variance_constraints_sent_in_component_review: Boolean(preferredFieldPolicy.studio_component_variance_constraints_sent_in_component_review),
    studio_parse_template_sent_direct_in_extract_review: Boolean(preferredFieldPolicy.studio_parse_template_sent_direct_in_extract_review),
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: Boolean(preferredFieldPolicy.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review),
    studio_required_level_sent_in_extract_review: Boolean(preferredFieldPolicy.studio_required_level_sent_in_extract_review),
    studio_component_entity_set_sent_when_component_field: Boolean(preferredFieldPolicy.studio_component_entity_set_sent_when_component_field),
    studio_evidence_policy_sent_direct_in_extract_review: Boolean(preferredFieldPolicy.studio_evidence_policy_sent_direct_in_extract_review),
    studio_variance_policy_sent_in_component_review: Boolean(preferredFieldPolicy.studio_variance_policy_sent_in_component_review),
    studio_constraints_sent_in_component_review: Boolean(preferredFieldPolicy.studio_constraints_sent_in_component_review),
    studio_send_booleans_prompted_to_model: Boolean(preferredFieldPolicy.studio_send_booleans_prompted_to_model),
    insufficient_evidence_action: String(preferredFieldPolicy.insufficient_evidence_action || 'threshold_unmet'),
    field_policy_default: preferredFieldPolicy,
    field_policy_by_key: fieldPolicyByKey,
    llm_output_min_evidence_refs_required: minEvidenceRefsEffective,
    min_evidence_refs_effective: minEvidenceRefsEffective,
    prime_sources_visual_send: primeVisualSend,
    table_linked_send: primeVisualSend
  };
}

export async function loadRouteMatrixPolicyForRun({
  config = {},
  category = '',
  categoryConfig = null,
  logger = null
} = {}) {
  const categoryToken = String(category || '').trim().toLowerCase();
  let routeRows = [];
  if (categoryToken) {
    let specDb = null;
    try {
      const { SpecDb } = await import('../../../../db/specDb.js');
      const dbPath = `${String(config.specDbDir || '.specfactory_tmp').replace(/[\\\/]+$/, '')}/${categoryToken}/spec.sqlite`;
      specDb = new SpecDb({
        dbPath,
        category: categoryToken
      });
      routeRows = specDb.getLlmRouteMatrix();
    } catch (error) {
      logger?.warn?.('route_matrix_policy_load_failed', {
        category: categoryToken,
        message: error?.message || 'unknown_error'
      });
    } finally {
      try {
        specDb?.close?.();
      } catch {
        // best effort
      }
    }
  }
  const derived = deriveRouteMatrixPolicy({
    routeRows,
    categoryConfig
  });
  return {
    ...derived,
    source: routeRows.length > 0 ? 'spec_db' : 'category_rules_default',
    row_count: routeRows.length
  };
}

export function resolveRuntimeControlKey(storage, config = {}) {
  const raw = String(configValue(config, 'runtimeControlFile')).trim();
  if (!raw) {
    return storage.resolveOutputKey('_runtime/control/runtime_overrides.json');
  }
  if (raw.startsWith(`${config.s3OutputPrefix || 'specs/outputs'}/`)) {
    return raw;
  }
  return storage.resolveOutputKey(raw);
}

export function resolveIndexingResumeKey(storage, category, productId) {
  return storage.resolveOutputKey('_runtime', 'indexing_resume', category, `${productId}.json`);
}

export function defaultRuntimeOverrides() {
  return {
    pause: false,
    max_urls_per_product: null,
    max_queries_per_product: null,
    blocked_domains: [],
    force_high_fields: [],
    disable_llm: false,
    disable_search: false,
    notes: ''
  };
}

export function normalizeRuntimeOverrides(payload = {}) {
  const input = payload && typeof payload === 'object' ? payload : {};
  return {
    ...defaultRuntimeOverrides(),
    ...input,
    pause: Boolean(input.pause),
    max_urls_per_product: input.max_urls_per_product === null || input.max_urls_per_product === undefined
      ? null
      : Math.max(1, toInt(input.max_urls_per_product, 0)),
    max_queries_per_product: input.max_queries_per_product === null || input.max_queries_per_product === undefined
      ? null
      : Math.max(1, toInt(input.max_queries_per_product, 0)),
    blocked_domains: Array.isArray(input.blocked_domains)
      ? [...new Set(input.blocked_domains.map((row) => String(row || '').trim().toLowerCase().replace(/^www\./, '')).filter(Boolean))]
      : [],
    force_high_fields: Array.isArray(input.force_high_fields)
      ? [...new Set(input.force_high_fields.map((row) => String(row || '').trim()).filter(Boolean))]
      : [],
    disable_llm: Boolean(input.disable_llm),
    disable_search: Boolean(input.disable_search),
    notes: String(input.notes || '')
  };
}

export function applyRuntimeOverridesToPlanner(planner, overrides = {}) {
  if (!planner || typeof planner !== 'object') {
    return;
  }
  // WHY: maxUrls override removed — planner caps are now internal hardcodes
  // pending the full sourcePlanner rewrite. Only blockHost survives.
  for (const host of overrides.blocked_domains || []) {
    planner.blockHost(host, 'runtime_override_blocked_domain');
  }
}
