/**
 * Pure helper functions for SpecDb.
 * Extracted from specDb.js — no side effects, no DB access.
 */

export function normalizeListLinkToken(value) {
  return String(value ?? '').trim();
}

export function expandListLinkValues(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeListLinkToken).filter(Boolean))];
  }
  const raw = normalizeListLinkToken(value);
  if (!raw) return [];
  const split = raw
    .split(/[,;|/]+/)
    .map((part) => normalizeListLinkToken(part))
    .filter(Boolean);
  const ordered = split.length > 1 ? split : [raw];
  const seen = new Set();
  const out = [];
  for (const token of ordered) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

export function toPositiveInteger(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toBoolInt(value, fallback = 0) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

export function toBand(effort) {
  const n = Math.max(1, Math.min(10, Number.parseInt(String(effort || 3), 10) || 3));
  if (n <= 3) return '1-3';
  if (n <= 6) return '4-6';
  if (n <= 8) return '7-8';
  return '9-10';
}

export function makeRouteKey(scope, requiredLevel, difficulty, availability, effortBand, idx = 0) {
  return `${scope}:${requiredLevel}:${difficulty}:${availability}:${effortBand}:${idx}`;
}

export function defaultContextFlagsForScope(scope = 'field') {
  const isComponent = scope === 'component';
  return {
    studio_key_navigation_sent_in_extract_review: 1,
    studio_contract_rules_sent_in_extract_review: 1,
    studio_extraction_guidance_sent_in_extract_review: 1,
    studio_tooltip_or_description_sent_when_present: 1,
    studio_enum_options_sent_when_present: 1,
    studio_component_variance_constraints_sent_in_component_review: isComponent ? 1 : 0,
    studio_parse_template_sent_direct_in_extract_review: 1,
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: 1,
    studio_required_level_sent_in_extract_review: 1,
    studio_component_entity_set_sent_when_component_field: isComponent ? 1 : 0,
    studio_evidence_policy_sent_direct_in_extract_review: 1,
    studio_variance_policy_sent_in_component_review: isComponent ? 1 : 0,
    studio_constraints_sent_in_component_review: isComponent ? 1 : 0,
    studio_send_booleans_prompted_to_model: 0
  };
}

export function baseLlmRoute({
  category,
  scope = 'field',
  required_level = 'expected',
  difficulty = 'medium',
  availability = 'expected',
  effort = 3,
  model_ladder_today = 'gpt-5-low -> gpt-5-medium',
  single_source_data = 1,
  all_source_data = 0,
  enable_websearch = 1,
  all_sources_confidence_repatch = 1,
  max_tokens = 4096,
  scalar_linked_send = 'scalar value + prime sources',
  component_values_send = 'component values + prime sources',
  list_values_send = 'list values prime sources',
  llm_output_min_evidence_refs_required = 1,
  insufficient_evidence_action = 'threshold_unmet',
  route_key
}) {
  const effortNorm = Math.max(1, Math.min(10, Number.parseInt(String(effort || 3), 10) || 3));
  return {
    category,
    scope,
    route_key: route_key || makeRouteKey(scope, required_level, difficulty, availability, toBand(effortNorm)),
    required_level,
    difficulty,
    availability,
    effort: effortNorm,
    effort_band: toBand(effortNorm),
    single_source_data: toBoolInt(single_source_data, 1),
    all_source_data: toBoolInt(all_source_data, 0),
    enable_websearch: toBoolInt(enable_websearch, 1),
    model_ladder_today,
    all_sources_confidence_repatch: toBoolInt(all_sources_confidence_repatch, 1),
    max_tokens: Math.max(256, Math.min(65536, Number.parseInt(String(max_tokens || 4096), 10) || 4096)),
    ...defaultContextFlagsForScope(scope),
    scalar_linked_send,
    component_values_send,
    list_values_send,
    llm_output_min_evidence_refs_required: Math.max(1, Math.min(5, Number.parseInt(String(llm_output_min_evidence_refs_required || 1), 10) || 1)),
    insufficient_evidence_action
  };
}

export function buildDefaultLlmRoutes(category) {
  const rows = [];
  const push = (row) => rows.push(baseLlmRoute({ category, ...row, route_key: makeRouteKey(row.scope, row.required_level, row.difficulty, row.availability, toBand(row.effort), rows.length + 1) }));

  // Field-key extraction defaults (based on current matrix intent)
  push({ scope: 'field', required_level: 'identity', difficulty: 'hard', availability: 'always', effort: 10, model_ladder_today: 'gpt-5.2-xhigh -> gpt-5.2-high', single_source_data: 0, all_source_data: 1, enable_websearch: 1, max_tokens: 24576, llm_output_min_evidence_refs_required: 2 });
  push({ scope: 'field', required_level: 'critical', difficulty: 'hard', availability: 'rare', effort: 9, model_ladder_today: 'gpt-5.2-high -> gpt-5.1-high', single_source_data: 0, all_source_data: 1, enable_websearch: 1, max_tokens: 16384, llm_output_min_evidence_refs_required: 2 });
  push({ scope: 'field', required_level: 'required', difficulty: 'hard', availability: 'expected', effort: 8, model_ladder_today: 'gpt-5.2-high -> gpt-5.1-high', single_source_data: 0, all_source_data: 1, enable_websearch: 1, max_tokens: 12288, llm_output_min_evidence_refs_required: 2 });
  push({ scope: 'field', required_level: 'required', difficulty: 'medium', availability: 'expected', effort: 6, model_ladder_today: 'gpt-5.1-medium -> gpt-5.2-medium', single_source_data: 1, all_source_data: 1, enable_websearch: 1, max_tokens: 8192, llm_output_min_evidence_refs_required: 2 });
  push({ scope: 'field', required_level: 'expected', difficulty: 'hard', availability: 'sometimes', effort: 7, model_ladder_today: 'gpt-5.1-high -> gpt-5.2-medium', single_source_data: 1, all_source_data: 1, enable_websearch: 1, max_tokens: 8192 });
  push({ scope: 'field', required_level: 'expected', difficulty: 'medium', availability: 'expected', effort: 5, model_ladder_today: 'gpt-5-medium -> gpt-5.1-medium', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 6144 });
  push({ scope: 'field', required_level: 'expected', difficulty: 'easy', availability: 'rare', effort: 3, model_ladder_today: 'gpt-5-low -> gpt-5-medium', single_source_data: 1, all_source_data: 1, enable_websearch: 1, max_tokens: 4096 });
  push({ scope: 'field', required_level: 'optional', difficulty: 'easy', availability: 'sometimes', effort: 2, model_ladder_today: 'gpt-5-minimal -> gpt-5-low', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 3072 });
  push({ scope: 'field', required_level: 'editorial', difficulty: 'easy', availability: 'editorial_only', effort: 1, model_ladder_today: 'gpt-5-minimal -> gpt-5-low', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 2048 });

  // Component full-review defaults (always send full component values at row/table level)
  push({ scope: 'component', required_level: 'critical', difficulty: 'hard', availability: 'expected', effort: 9, model_ladder_today: 'gpt-5.2-high -> gpt-5.2-medium', single_source_data: 1, all_source_data: 1, enable_websearch: 1, max_tokens: 16384, component_values_send: 'component values + prime sources', llm_output_min_evidence_refs_required: 2 });
  push({ scope: 'component', required_level: 'expected', difficulty: 'medium', availability: 'expected', effort: 6, model_ladder_today: 'gpt-5.1-medium -> gpt-5.2-medium', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 8192, component_values_send: 'component values + prime sources' });
  push({ scope: 'component', required_level: 'optional', difficulty: 'easy', availability: 'sometimes', effort: 3, model_ladder_today: 'gpt-5-low -> gpt-5-medium', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 4096, component_values_send: 'component values' });

  // List full-review defaults (always send full list values at list level)
  push({ scope: 'list', required_level: 'required', difficulty: 'hard', availability: 'rare', effort: 8, model_ladder_today: 'gpt-5.2-high -> gpt-5.1-high', single_source_data: 1, all_source_data: 1, enable_websearch: 1, max_tokens: 12288, list_values_send: 'list values prime sources', llm_output_min_evidence_refs_required: 2 });
  push({ scope: 'list', required_level: 'expected', difficulty: 'medium', availability: 'expected', effort: 5, model_ladder_today: 'gpt-5-medium -> gpt-5.1-medium', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 6144, list_values_send: 'list values prime sources' });
  push({ scope: 'list', required_level: 'optional', difficulty: 'easy', availability: 'sometimes', effort: 2, model_ladder_today: 'gpt-5-minimal -> gpt-5-low', single_source_data: 1, all_source_data: 0, enable_websearch: 0, max_tokens: 3072, list_values_send: 'list values' });

  return rows;
}
