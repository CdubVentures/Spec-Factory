import {
  ruleRequiredLevel,
  ruleAvailability,
  ruleDifficulty,
} from '../engine/ruleAccessors.js';
import {
  AVAILABILITY_RANKS,
  DIFFICULTY_RANKS,
  REQUIRED_LEVEL_RANKS,
  PRIORITY_BUCKET_ORDER,
  EXHAUSTION_MIN_ATTEMPTS,
  EXHAUSTION_MIN_EVIDENCE_CLASSES,
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
  mapRequiredLevelToBucket,
} from '../shared/discoveryRankConstants.js';
import { hasKnownValue } from '../shared/valueNormalizers.js';

// ── V4 helpers ──

export function normalizeFieldKey(fieldKey) {
  return String(fieldKey ?? '').trim().toLowerCase().replace(/_/g, ' ');
}

export function buildAllAliases({ normalizedKey, displayName, fieldAliases, queryTerms } = {}) {
  const set = new Set();
  for (const raw of [normalizedKey, displayName, ...(fieldAliases || []), ...(queryTerms || [])]) {
    const token = String(raw ?? '').trim().toLowerCase();
    if (token) set.add(token);
  }
  return [...set].sort();
}

export function shardAliases(aliases, maxTokensPerShard = 8) {
  if (!Array.isArray(aliases) || aliases.length === 0) return [];
  const shards = [];
  let current = [];
  let currentTokens = 0;
  for (const alias of aliases) {
    const words = alias.split(/\s+/).length;
    if (current.length > 0 && currentTokens + words > maxTokensPerShard) {
      shards.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(alias);
    currentTokens += words;
  }
  if (current.length > 0) shards.push(current);
  return shards;
}

export { availabilityRank, difficultyRank, requiredLevelRank, deriveQueryFamilies };

const NEED_SCORE_WEIGHTS = { identity: 100, critical: 80, required: 60, expected: 30, optional: 10 };

import { isObject } from '../shared/primitives.js';

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRequiredLevel(value) {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'identity' || token === 'critical' || token === 'required' || token === 'expected') {
    return token;
  }
  return 'optional';
}

const hasKnownFieldValue = hasKnownValue;

function isFieldConflict(field, fieldReasoning = {}, constraintAnalysis = {}) {
  const reasoning = fieldReasoning?.[field] || {};
  if (Array.isArray(reasoning.reasons) && reasoning.reasons.includes('constraint_conflict')) {
    return true;
  }
  if (Array.isArray(reasoning.contradictions) && reasoning.contradictions.length > 0) {
    return true;
  }
  const contradictions = Array.isArray(constraintAnalysis?.contradictions)
    ? constraintAnalysis.contradictions
    : [];
  return contradictions.some((row) => Array.isArray(row?.fields) && row.fields.includes(field));
}

function collectFieldKeys({ fieldOrder = [], provenance = {}, fieldRules = {} }) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  for (const field of fieldOrder || []) push(field);
  for (const field of Object.keys(provenance || {})) push(field);
  const ruleRows = isObject(fieldRules?.fields) ? fieldRules.fields : fieldRules;
  for (const field of Object.keys(ruleRows || {})) push(field);
  return out;
}

// --- State derivation ---

function deriveFieldState({ missing, conflict, confidence, passTarget }) {
  if (conflict) return 'conflict';
  if (missing) return 'missing';
  if (confidence === null || confidence < passTarget) return 'weak';
  return 'covered';
}

// WHY: NeedSet assessment uses "accepted"/"unknown" instead of "covered"/"missing"
function mapInternalToSchemaState(internalState) {
  if (internalState === 'covered') return 'accepted';
  if (internalState === 'missing') return 'unknown';
  return internalState; // 'weak' and 'conflict' unchanged
}


// WHY: Logic Box 1 step 1 requires normalization of per-field hints
// to prevent duplicate/variant terms from wasting planner query budget.
function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const result = [];
  for (const item of arr) {
    const normalized = String(item ?? '').toLowerCase().trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizeDomainHints(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const result = [];
  for (const item of arr) {
    let host = String(item ?? '').trim();
    if (!host) continue;
    // Strip protocol
    host = host.replace(/^https?:\/\//i, '');
    // Strip path, query, fragment
    host = host.split('/')[0].split('?')[0].split('#')[0];
    host = host.toLowerCase().trim();
    if (host && !seen.has(host)) {
      seen.add(host);
      result.push(host);
    }
  }
  return result;
}

function extractSearchHints(rule = {}) {
  const hints = isObject(rule.search_hints) ? rule.search_hints : {};
  return {
    query_terms: normalizeStringArray(hints.query_terms),
    preferred_content_types: normalizeStringArray(hints.preferred_content_types),
    domain_hints: normalizeDomainHints(hints.domain_hints),
    query_templates: Array.isArray(hints.query_templates) ? hints.query_templates : [],
    content_types: normalizeStringArray(hints.content_types)
  };
}

// WHY: Exact-match lookup prevents substring false positives (e.g. 'doc' matching 'undocumented').
// Keys sourced from CONTENT_TYPE_SUFFIX in queryFieldRuleGates.js + LLM planner tokens.
const CONTENT_TYPE_TO_FAMILY = {
  manual: 'manual_pdf',
  pdf: 'manual_pdf',
  manual_pdf: 'manual_pdf',
  datasheet_pdf: 'manual_pdf',
  support: 'support_docs',
  doc: 'support_docs',
  documentation: 'support_docs',
  spec: 'manufacturer_html',
  spec_sheet: 'manufacturer_html',
  spec_pdf: 'manufacturer_html',
  product: 'manufacturer_html',
  product_page: 'manufacturer_html',
  review: 'manufacturer_html',
  lab_review: 'manufacturer_html',
  teardown_review: 'manufacturer_html',
  lab: 'manufacturer_html',
  benchmark: 'manufacturer_html',
  teardown: 'manufacturer_html',
  datasheet: 'manufacturer_html',
  comparison: 'manufacturer_html',
  reference: 'manufacturer_html',
};

function deriveQueryFamilies(contentTarget, domainHints) {
  const families = new Set();
  if (domainHints.length > 0) families.add('manufacturer_html');
  for (const ct of contentTarget) {
    const family = CONTENT_TYPE_TO_FAMILY[String(ct).toLowerCase().trim()];
    if (family) families.add(family);
  }
  if (families.size === 0) families.add('fallback_web');
  return [...families].sort();
}

function formBundles(eligibleFields, bundleAssignmentNotes) {
  const bucketGroups = new Map();
  for (const field of eligibleFields) {
    const bucket = field.priority_bucket;
    if (!bucketGroups.has(bucket)) bucketGroups.set(bucket, []);
    bucketGroups.get(bucket).push(field);
  }

  const bundles = [];
  let bundleIndex = 0;

  for (const [bucket, fields] of bucketGroups) {
    const contentGroups = new Map();
    for (const field of fields) {
      const contentKey = field.preferred_content_types.slice().sort().join('|') || '_default';
      if (!contentGroups.has(contentKey)) contentGroups.set(contentKey, []);
      contentGroups.get(contentKey).push(field);
    }

    for (const [contentKey, groupFields] of contentGroups) {
      bundleIndex++;
      const bundleId = `bundle_${String(bundleIndex).padStart(3, '0')}`;

      const allQueryTerms = new Set();
      const allDomainHints = new Set();
      const allPreferredContentTypes = new Set();

      for (const f of groupFields) {
        for (const t of f.query_terms) allQueryTerms.add(t);
        for (const d of f.domain_hints) allDomainHints.add(d);
        for (const c of f.preferred_content_types) allPreferredContentTypes.add(c);
      }

      const preferredContentTypes = [...allPreferredContentTypes].sort();
      const domainHints = [...allDomainHints].sort();
      const queryTerms = [...allQueryTerms].sort();
      const plannedQueryFamilies = deriveQueryFamilies(preferredContentTypes, domainHints);

      const fieldStates = {};
      for (const f of groupFields) {
        fieldStates[f.field_key] = f.state;
      }

      bundles.push({
        bundle_id: bundleId,
        label: `${bucket}_${contentKey === '_default' ? 'general' : contentKey.replace(/\|/g, '_')}`,
        priority_bucket: bucket,
        fields: groupFields.map((f) => f.field_key).sort(),
        states: fieldStates,
        preferred_content_types: preferredContentTypes,
        query_terms: queryTerms,
        domain_hints: domainHints,
        planned_query_families: plannedQueryFamilies
      });

      bundleAssignmentNotes.push(
        `${bundleId}: ${groupFields.length} fields in ${bucket}/${contentKey}`
      );
    }
  }

  bundles.sort((a, b) => {
    const diff = (PRIORITY_BUCKET_ORDER[a.priority_bucket] ?? 3) - (PRIORITY_BUCKET_ORDER[b.priority_bucket] ?? 3);
    if (diff !== 0) return diff;
    return a.bundle_id.localeCompare(b.bundle_id);
  });

  return bundles;
}

function deriveProfileMix(bundles) {
  const mix = {
    manufacturer_html: 0,
    manual_pdf: 0,
    support_docs: 0,
    fallback_web: 0,
    targeted_single_field: 0
  };
  for (const bundle of bundles) {
    for (const family of bundle.planned_query_families) {
      if (family in mix) mix[family]++;
    }
    if (bundle.fields.length === 1) mix.targeted_single_field++;
  }
  return mix;
}

function selectFocusFields(eligibleFields, maxFocus = 10) {
  const sorted = [...eligibleFields].sort((a, b) => {
    const bucketDiff = (PRIORITY_BUCKET_ORDER[a.priority_bucket] ?? 3) - (PRIORITY_BUCKET_ORDER[b.priority_bucket] ?? 3);
    if (bucketDiff !== 0) return bucketDiff;
    return a.field_key.localeCompare(b.field_key);
  });
  return sorted.slice(0, maxFocus).map((f) => f.field_key);
}

// --- NeedSet assessment: Identity derivation ---

function deriveSourceLabelState(identityContext) {
  const status = String(identityContext?.status || '').toLowerCase();
  const confidence = toNumber(identityContext?.confidence, 0);
  const contradictionCount = toNumber(identityContext?.contradiction_count, 0);

  if (status === 'conflict' || contradictionCount > 0) return 'different';
  if (status === 'locked' && confidence >= 0.95) return 'matched';
  if (confidence >= 0.70) return 'possible';
  return 'unknown';
}

function mapIdentityState(identityContext) {
  const status = String(identityContext?.status || '').toLowerCase();
  if (status === 'locked') return 'locked';
  if (status === 'provisional') return 'provisional';
  if (status === 'conflict') return 'conflict';
  return 'unknown';
}

// --- NeedSet assessment: Reasons derivation ---

function deriveFieldReasons({ field, internalState, value, confidence, passTarget, refsFound, minEvidenceRefs, rule, fieldReasoning, constraintAnalysis }) {
  const reasons = [];

  if (!hasKnownFieldValue(value)) {
    reasons.push('missing');
  }

  if (isFieldConflict(field, fieldReasoning, constraintAnalysis)) {
    reasons.push('conflict');
  }

  const known = hasKnownFieldValue(value);
  if (known && confidence !== null && confidence < passTarget) {
    reasons.push('low_conf');
  }

  if (known && minEvidenceRefs > 0 && refsFound < minEvidenceRefs) {
    reasons.push('min_refs_fail');
  }

  // tier_pref_unmet: best_tier_seen > preferred tier minimum
  // Not derivable without tier preferences comparison; reserved for future

  if (rule?.priority?.block_publish_when_unk && internalState !== 'covered') {
    reasons.push('publish_gate_block');
  }

  return reasons;
}

// --- NeedSet assessment: History derivation ---

function deriveFieldHistory({ round, provenance, previousFieldHistories, field }) {
  const prev = previousFieldHistories?.[field] || {};
  const evidence = Array.isArray(provenance?.evidence) ? provenance.evidence : [];

  if (round === 0) {
    return {
      existing_queries: [],
      domains_tried: [],
      host_classes_tried: [],
      evidence_classes_tried: [],
      query_count: 0,
      urls_examined_count: 0,
      refs_found: 0,
      no_value_attempts: 0,
      duplicate_attempts_suppressed: 0,
      query_modes_tried_for_key: [],
    };
  }

  // Round 1+: derive from evidence + carry forward
  const domainsTried = new Set(Array.isArray(prev.domains_tried) ? prev.domains_tried : []);
  for (const ev of evidence) {
    const domain = String(ev?.rootDomain || '').trim();
    if (domain) domainsTried.add(domain);
  }

  return {
    existing_queries: Array.isArray(prev.existing_queries) ? prev.existing_queries : [],
    domains_tried: [...domainsTried].sort(),
    host_classes_tried: Array.isArray(prev.host_classes_tried) ? prev.host_classes_tried : [],
    evidence_classes_tried: Array.isArray(prev.evidence_classes_tried) ? prev.evidence_classes_tried : [],
    query_count: toNumber(prev.query_count, 0),
    urls_examined_count: toNumber(prev.urls_examined_count, 0),
    refs_found: evidence.length,
    no_value_attempts: toNumber(prev.no_value_attempts, 0),
    duplicate_attempts_suppressed: toNumber(prev.duplicate_attempts_suppressed, 0),
    query_modes_tried_for_key: Array.isArray(prev.query_modes_tried_for_key) ? prev.query_modes_tried_for_key : [],
  };
}

export function computeNeedSet({
  runId = '',
  category = '',
  productId = '',
  fieldOrder = [],
  provenance = {},
  fieldRules = {},
  fieldReasoning = {},
  constraintAnalysis = {},
  identityContext = {},
  now = new Date().toISOString(),

  // NeedSet assessment new params
  round = 0,
  brand = '',
  model = '',
  baseModel = '',
  aliases = [],
  previousFieldHistories = {},
} = {}) {
  const rulesMap = isObject(fieldRules?.fields) ? fieldRules.fields : (isObject(fieldRules) ? fieldRules : {});
  const fieldKeys = collectFieldKeys({ fieldOrder, provenance, fieldRules: rulesMap });

  const eligibleFields = [];
  const schema2Fields = [];

  // --- Per-field bucket counts (total, not just unresolved) ---
  let coreTotal = 0;
  let secondaryTotal = 0;
  let optionalTotal = 0;
  let resolvedCount = 0;

  for (const field of fieldKeys) {
    const prov = provenance?.[field] || {};
    const rule = rulesMap?.[field] || {};
    const requiredLevel = normalizeRequiredLevel(ruleRequiredLevel(rule));
    const value = prov.value ?? 'unk';
    const confidence = toNumber(prov.confidence, null);
    const passTarget = clamp01(toNumber(prov.pass_target, 0.8));
    const missing = !hasKnownFieldValue(value);
    const conflict = isFieldConflict(field, fieldReasoning, constraintAnalysis);

    const internalState = deriveFieldState({ missing, conflict, confidence, passTarget });
    const schemaState = mapInternalToSchemaState(internalState);
    const priorityBucket = mapRequiredLevelToBucket(requiredLevel);
    const searchHints = extractSearchHints(rule);

    const preferredContentTypes = searchHints.preferred_content_types.length > 0
      ? searchHints.preferred_content_types
      : searchHints.content_types;

    // Count totals per bucket
    if (priorityBucket === 'core') coreTotal++;
    else if (priorityBucket === 'secondary') secondaryTotal++;
    else optionalTotal++;

    if (internalState === 'covered') resolvedCount++;

    if (internalState !== 'covered') {
      eligibleFields.push({
        field_key: field,
        required_level: requiredLevel,
        priority_bucket: priorityBucket,
        state: internalState,
        preferred_content_types: preferredContentTypes,
        query_terms: searchHints.query_terms,
        domain_hints: searchHints.domain_hints,
        availability: ruleAvailability(rule),
        difficulty: ruleDifficulty(rule),
      });
    }

    // --- Build NeedSet assessment field entry ---
    const evidence = Array.isArray(prov.evidence) ? prov.evidence : [];
    const refsFound = evidence.length || toNumber(prov.confirmations, 0);
    const minEvidenceRefs = toNumber(rule.min_evidence_refs, 0);
    const effectiveConfidence = clamp01(toNumber(confidence, 0));
    const meetsPassTarget = internalState === 'covered' || (confidence !== null && confidence >= passTarget);

    // WHY: Guard against Math.min(...[]) returning Infinity when all tiers are >= 99.
    const validTiers = evidence.map((e) => toNumber(e?.tier, 99)).filter((t) => t !== null && t < 99);
    const bestTierSeen = validTiers.length > 0 ? Math.min(...validTiers) : null;

    const reasons = deriveFieldReasons({
      field,
      internalState,
      value,
      confidence,
      passTarget,
      refsFound,
      minEvidenceRefs,
      rule,
      fieldReasoning,
      constraintAnalysis
    });

    const history = deriveFieldHistory({
      round,
      provenance: prov,
      previousFieldHistories,
      field
    });

    const needScoreWeight = NEED_SCORE_WEIGHTS[requiredLevel] || 10;
    const needScore = internalState === 'covered'
      ? 0
      : needScoreWeight * (1 + reasons.length * 0.2);

    const label = String(rule.display_name || rule.ui?.label || field).trim();
    const groupKey = String(rule.group || '').trim() || null;
    const tooltipMd = rule.ui?.tooltip_md || null;
    const fieldAliases = Array.isArray(rule.aliases) ? rule.aliases : [];
    const exactMatchRequired = Boolean(rule.contract?.exact_match);

    // V4: per-field search pack
    const fieldAvailability = ruleAvailability(rule);
    const fieldDifficulty = ruleDifficulty(rule);
    const normalizedKey = normalizeFieldKey(field);
    const allAliases = buildAllAliases({
      normalizedKey,
      displayName: label,
      fieldAliases,
      queryTerms: searchHints.query_terms,
    });
    const aliasShards = shardAliases(allAliases, 8);

    schema2Fields.push({
      field_key: field,
      label,
      group_key: groupKey,
      required_level: requiredLevel,
      idx: {
        min_evidence_refs: minEvidenceRefs,
        query_terms: searchHints.query_terms,
        domain_hints: searchHints.domain_hints,
        preferred_content_types: preferredContentTypes,
        tooltip_md: tooltipMd,
        aliases: fieldAliases
      },
      state: schemaState,
      value: value,
      confidence: toNumber(confidence, 0),
      effective_confidence: effectiveConfidence,
      refs_found: refsFound,
      min_refs: minEvidenceRefs,
      best_tier_seen: (bestTierSeen !== null && Number.isFinite(bestTierSeen) && bestTierSeen < 99) ? bestTierSeen : null,
      pass_target: passTarget,
      meets_pass_target: meetsPassTarget,
      exact_match_required: exactMatchRequired,
      need_score: needScore,
      reasons,
      history,
      // V4 per-field search pack
      normalized_key: normalizedKey,
      all_aliases: allAliases,
      alias_shards: aliasShards,
      availability: fieldAvailability,
      difficulty: fieldDifficulty,
      search_intent: exactMatchRequired ? 'exact_match' : 'broad',
      repeat_count: toNumber(history.query_count, 0),
      query_modes_tried_for_key: history.query_modes_tried_for_key || [],
      domains_tried_for_key: history.domains_tried || [],
      content_types_tried_for_key: history.evidence_classes_tried || [],
    });
  }

  // --- Form bundles (backward compat) ---
  const bundleAssignmentNotes = [];
  const bundles = formBundles(eligibleFields, bundleAssignmentNotes);

  const fieldBundleMap = new Map();
  for (const bundle of bundles) {
    for (const f of bundle.fields) {
      fieldBundleMap.set(f, bundle.bundle_id);
    }
  }

  // --- Build rows (backward compat) ---
  const rows = eligibleFields.map((f) => ({
    field_key: f.field_key,
    required_level: f.required_level,
    priority_bucket: f.priority_bucket,
    state: f.state,
    bundle_id: fieldBundleMap.get(f.field_key) || ''
  }));

  rows.sort((a, b) => {
    const bucketDiff = (PRIORITY_BUCKET_ORDER[a.priority_bucket] ?? 3) - (PRIORITY_BUCKET_ORDER[b.priority_bucket] ?? 3);
    if (bucketDiff !== 0) return bucketDiff;
    return a.field_key.localeCompare(b.field_key);
  });

  // --- Profile mix (backward compat) ---
  const profileMix = deriveProfileMix(bundles);

  // --- Focus fields (backward compat) ---
  const focusFields = selectFocusFields(eligibleFields);

  // --- Blockers (NeedSet assessment: 5 fields) ---
  const missingCount = rows.filter((r) => r.state === 'missing').length;
  const weakCount = rows.filter((r) => r.state === 'weak').length;
  const conflictCount = rows.filter((r) => r.state === 'conflict').length;
  const needsExactMatchCount = schema2Fields.filter(
    (f) => f.exact_match_required && f.state !== 'accepted'
  ).length;
  // WHY: A field is search-exhausted when it's been targeted multiple times
  // with diverse evidence classes and still has no value. This tells the planner
  // to stop wasting query budget on dead-end fields.
  const searchExhaustedCount = schema2Fields.filter((f) => {
    if (f.state === 'accepted') return false;
    const hist = f.history || {};
    const attempts = toNumber(hist.no_value_attempts, 0);
    const classCount = Array.isArray(hist.evidence_classes_tried) ? hist.evidence_classes_tried.length : 0;
    return attempts >= EXHAUSTION_MIN_ATTEMPTS && classCount >= EXHAUSTION_MIN_EVIDENCE_CLASSES;
  }).length;

  // --- Summary (NeedSet assessment: 9 fields + backward compat) ---
  const coreUnresolved = rows.filter((r) => r.priority_bucket === 'core').length;
  const secondaryUnresolved = rows.filter((r) => r.priority_bucket === 'secondary').length;
  const optionalUnresolved = rows.filter((r) => r.priority_bucket === 'optional').length;

  const summary = {
    total: fieldKeys.length,
    resolved: resolvedCount,
    core_total: coreTotal,
    core_unresolved: coreUnresolved,
    secondary_total: secondaryTotal,
    secondary_unresolved: secondaryUnresolved,
    optional_total: optionalTotal,
    optional_unresolved: optionalUnresolved,
    conflicts: conflictCount,
    // backward compat
    bundles_planned: bundles.length
  };

  // --- Identity block (NeedSet assessment) ---
  const identity = {
    state: mapIdentityState(identityContext),
    source_label_state: deriveSourceLabelState(identityContext),
    manufacturer: String(brand || identityContext?.manufacturer || '').trim() || null,
    model: String(model || '').trim() || null,
    confidence: toNumber(identityContext?.confidence, 0),
    official_domain: identityContext?.official_domain || null,
    support_domain: identityContext?.support_domain || null
  };

  // --- Planner seed (NeedSet assessment) ---
  const missingCriticalFields = schema2Fields
    .filter((f) => (f.required_level === 'identity' || f.required_level === 'critical') && f.state !== 'accepted')
    .map((f) => f.field_key);

  const unresolvedFields = schema2Fields
    .filter((f) => f.state !== 'accepted')
    .map((f) => f.field_key);

  const existingQueriesSet = new Set();
  for (const f of schema2Fields) {
    for (const q of f.history.existing_queries) {
      existingQueriesSet.add(q);
    }
  }

  const plannerSeed = {
    missing_critical_fields: missingCriticalFields,
    unresolved_fields: unresolvedFields,
    existing_queries: [...existingQueriesSet].sort(),
    current_product_identity: {
      category: String(category || '').trim(),
      brand: String(brand || '').trim(),
      model: String(model || '').trim()
    }
  };

  // --- V4: sorted_unresolved_keys (availability → difficulty → repeat → need_score → required_level) ---
  const unresolvedWithScores = schema2Fields
    .filter((f) => f.state !== 'accepted')
    .map((f) => ({
      field_key: f.field_key,
      avail: availabilityRank(f.availability),
      diff: difficultyRank(f.difficulty),
      repeat: toNumber(f.repeat_count, 0),
      need: f.need_score,
      req: requiredLevelRank(f.required_level),
    }));
  unresolvedWithScores.sort((a, b) =>
    (a.avail - b.avail)
    || (a.diff - b.diff)
    || (a.repeat - b.repeat)
    || (b.need - a.need)
    || (a.req - b.req)
  );
  const sortedUnresolvedKeys = unresolvedWithScores.map((f) => f.field_key);

  // --- Debug ---
  const debug = {
    suppressed_duplicate_rows: [],
    state_inputs: {
      total_fields: fieldKeys.length,
      eligible_count: eligibleFields.length,
      covered_count: fieldKeys.length - eligibleFields.length
    },
    bundle_assignment_notes: bundleAssignmentNotes,
    identity_context: identityContext
  };

  return {
    // NeedSet assessment additions
    schema_version: 'needset_output.v2.1',
    round,
    identity,
    fields: schema2Fields,
    planner_seed: plannerSeed,
    sorted_unresolved_keys: sortedUnresolvedKeys,

    // Existing output (backward compat)
    run_id: String(runId || '').trim(),
    category: String(category || '').trim(),
    product_id: String(productId || '').trim(),
    generated_at: now,
    total_fields: fieldKeys.length,
    summary,
    blockers: {
      missing: missingCount,
      weak: weakCount,
      conflict: conflictCount,
      needs_exact_match: needsExactMatchCount,
      search_exhausted: searchExhaustedCount
    },
    focus_fields: focusFields,
    bundles,
    profile_mix: profileMix,
    rows,
    debug
  };
}
