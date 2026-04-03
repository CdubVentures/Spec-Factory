// WHY: Self-contained pipeline functions extracted from compiled bundle.
// No imports — every helper is inlined to keep this file standalone.

// --- Constants (from src/constants.js) ---

const INSTRUMENTED_FIELDS = new Set([
  'sensor_latency',
  'sensor_latency_list',
  'shift_latency',
  'click_latency',
  'click_latency_list',
  'click_force',
]);

const COMMONLY_WRONG_FIELDS = new Set([
  'weight',
  'lngth',
  'width',
  'height',
  'sensor',
  'polling_rate',
  'dpi',
  'ips',
  'acceleration',
  'switch',
  'side_buttons',
  'middle_buttons',
]);

const NUMERIC_FIELDS = new Set([
  'battery_hours',
  'weight',
  'lngth',
  'width',
  'height',
  'sensor_latency',
  'shift_latency',
  'dpi',
  'ips',
  'acceleration',
  'lift',
  'debounce',
  'click_latency',
  'click_force',
  'side_buttons',
  'middle_buttons',
  'programmable_buttons',
  'onboard_memory_value',
]);

const LIST_FIELDS = new Set([
  'cardTags',
  'colors',
  'connectivity',
  'grip',
  'hand_size',
  'lift_settings',
  'sensor_latency_list',
  'polling_rate',
  'click_latency_list',
]);

const INSTRUMENTED_HOST_HINTS = new Set(['rtings.com', 'techpowerup.com']);

// --- Consensus engine constants (from src/scoring/consensusEngine.js) ---

const METHOD_WEIGHT = {
  network_json: 1,
  adapter_api: 0.95,
  pdf_table: 0.95,
  pdf_kv: 0.93,
  pdf: 0.82,
  scanned_pdf_ocr_table: 0.88,
  scanned_pdf_ocr_kv: 0.86,
  scanned_pdf_ocr_text: 0.78,
  html_table: 0.9,
  json_ld: 0.9,
  microdata: 0.88,
  opengraph: 0.8,
  microformat: 0.78,
  rdfa: 0.78,
  twitter_card: 0.78,
  embedded_state: 0.85,
  ldjson: 0.75,
  llm_extract: 0.2,
  dom: 0.4,
};

const TIER_WEIGHT = {
  1: 1,
  2: 0.8,
  3: 0.45,
};

const PASS_EXEMPT_FIELDS = new Set([
  'id',
  'brand',
  'model',
  'base_model',
  'category',
  'sku',
]);

const POLICY_BONUS = 0.3;

const LLM_METHODS = new Set(['llm_extract']);

// --- List union reducer constants (from src/scoring/listUnionReducer.js) ---

const SUPPORTED_POLICIES = new Set(['set_union', 'ordered_union']);

// --- Field keys constants (from src/utils/fieldKeys.js) ---

const IDENTITY_FIELDS = new Set([
  'id',
  'brand',
  'model',
  'base_model',
  'variant',
  'sku',
  'mpn',
  'gtin',
  'category',
]);

const FIELD_ALIASES = {
  switch_link: 'switches_link',
};

// --- Common utilities ---

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeToken(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitListValue(value) {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeWhitespace(v)).filter(Boolean);
  }
  return String(value || '').split(/[,;|\/]+/).map((part) => normalizeWhitespace(part)).filter(Boolean);
}

function parseNumber(value) {
  if (value === null || value === void 0) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const match = String(value).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function getByPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') {
      return void 0;
    }
    cur = cur[part];
  }
  return cur;
}

function valueFilled(value) {
  if (value === void 0 || value === null) {
    return false;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return false;
  }
  return text !== 'unk';
}

function hasKnownFieldValue(val) {
  const s = String(val ?? '').trim().toLowerCase();
  return s !== '' && s !== 'unk' && s !== 'unknown' && s !== 'n/a';
}

// --- Candidate identifier (from src/utils/candidateIdentifier.js) ---

// WHY: candidateIdentifier uses its own normalizeToken variant (hyphen-joined)
function candidateNormalizeToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function serializePart(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashParts(parts) {
  const input = parts.map((part) => serializePart(part)).join('');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function tokenPart(value, fallback = 'na') {
  const token = candidateNormalizeToken(serializePart(value));
  if (!token) {
    return fallback;
  }
  return token.length > 48 ? token.slice(0, 48) : token;
}

function buildCandidateId(prefix, parts = []) {
  const safePrefix = tokenPart(prefix, 'cand');
  const tokens = Array.isArray(parts) ? parts.map((part) => tokenPart(part)).filter(Boolean) : [tokenPart(parts)];
  const hash = hashParts([safePrefix, ...parts]);
  return [safePrefix, ...tokens, hash].join('_');
}

function buildFallbackFieldCandidateId({ productId = '', fieldKey, value = '', index = 0, variant = 'candidate' }) {
  const prefix = variant === 'selected' ? 'selected_item' : 'cand_item';
  return buildCandidateId(prefix, [productId, fieldKey, value, index]);
}

// --- Field keys (from src/utils/fieldKeys.js) ---

function cleanToken(value) {
  return String(value || '').replace(/\[\d+\]/g, '').replace(/[^a-zA-Z0-9_./-]+/g, ' ').trim();
}

function canonicalFieldMap(fieldOrder = []) {
  const map = new Map();
  for (const field of fieldOrder || []) {
    const key = String(field || '').trim().toLowerCase();
    if (!key) {
      continue;
    }
    map.set(key, String(field));
  }
  return map;
}

function normalizeTail(raw) {
  const token = cleanToken(raw).replace(/[./]+/g, '.').replace(/-/g, '_').replace(/\s+/g, '').toLowerCase();
  const tail = token.includes('.') ? token.split('.').pop() : token;
  return FIELD_ALIASES[tail] || tail;
}

function toRawFieldKey(value, options = {}) {
  const fieldMap = canonicalFieldMap(options.fieldOrder || []);
  const token = normalizeWhitespace(value);
  if (!token) {
    return '';
  }
  const lowered = token.toLowerCase();
  let tail = '';
  if (lowered.startsWith('fields.')) {
    tail = normalizeTail(token.slice('fields.'.length));
  } else if (lowered.startsWith('specs.')) {
    tail = normalizeTail(token.slice('specs.'.length));
  } else if (lowered.startsWith('identity.')) {
    tail = normalizeTail(token.slice('identity.'.length));
  } else {
    tail = normalizeTail(token);
  }
  if (!tail) {
    return '';
  }
  if (fieldMap.has(tail)) {
    return fieldMap.get(tail);
  }
  return tail;
}

function normalizeRequiredFieldPath(value, options = {}) {
  const token = normalizeWhitespace(value);
  if (!token) {
    return '';
  }
  const lowered = token.toLowerCase();
  if (lowered.startsWith('identity.')) {
    const tail = normalizeTail(token.slice('identity.'.length));
    if (!tail) {
      return '';
    }
    return `identity.${tail}`;
  }
  const field = toRawFieldKey(token, options);
  if (!field) {
    return '';
  }
  if (IDENTITY_FIELDS.has(field)) {
    return `identity.${field}`;
  }
  return `fields.${field}`;
}

// --- Consensus engine (from src/scoring/consensusEngine.js) ---

function resolveParsingConfidenceBaseMap(config = null) {
  const source = config?.parsingConfidenceBaseMap && typeof config.parsingConfidenceBaseMap === 'object' ? config.parsingConfidenceBaseMap : {};
  const read = (key, fallback) => {
    const parsed = Number.parseFloat(String(source?.[key] ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const microformatRdfa = read('microformat_rdfa', read('microformat', METHOD_WEIGHT.microformat));
  return {
    network_json: read('network_json', METHOD_WEIGHT.network_json),
    embedded_state: read('embedded_state', METHOD_WEIGHT.embedded_state),
    json_ld: read('json_ld', METHOD_WEIGHT.json_ld),
    microdata: read('microdata', METHOD_WEIGHT.microdata),
    opengraph: read('opengraph', METHOD_WEIGHT.opengraph),
    microformat: microformatRdfa,
    rdfa: microformatRdfa,
  };
}

function resolveMethodWeight(method, tier, config = null) {
  const methodToken = String(method || '').trim().toLowerCase();
  const parsingConfidenceBaseMap = resolveParsingConfidenceBaseMap(config);
  if (methodToken === 'llm_extract') {
    const llmExtractBase = Number.parseFloat(String(config?.consensusMethodWeightLlmExtractBase ?? METHOD_WEIGHT.llm_extract));
    const safeLlmExtractBase = Number.isFinite(llmExtractBase) ? llmExtractBase : METHOD_WEIGHT.llm_extract;
    if (tier === 1) return config?.consensusLlmWeightTier1 ?? 0.6;
    if (tier === 2) return config?.consensusLlmWeightTier2 ?? 0.4;
    if (tier === 3) return config?.consensusLlmWeightTier3 ?? safeLlmExtractBase;
    return config?.consensusLlmWeightTier4 ?? Math.min(safeLlmExtractBase, 0.15);
  }
  if (methodToken === 'network_json') {
    return config?.consensusMethodWeightNetworkJson ?? parsingConfidenceBaseMap.network_json;
  }
  if (methodToken === 'adapter_api') {
    return config?.consensusMethodWeightAdapterApi ?? METHOD_WEIGHT.adapter_api;
  }
  if (methodToken === 'json_ld' || methodToken === 'structured_meta') {
    return config?.consensusMethodWeightStructuredMeta ?? parsingConfidenceBaseMap.json_ld;
  }
  if (methodToken === 'pdf') {
    return config?.consensusMethodWeightPdf ?? METHOD_WEIGHT.pdf;
  }
  if (methodToken === 'table_kv') {
    return config?.consensusMethodWeightTableKv ?? 0.78;
  }
  if (methodToken === 'dom') {
    return config?.consensusMethodWeightDom ?? METHOD_WEIGHT.dom;
  }
  return parsingConfidenceBaseMap[methodToken] ?? METHOD_WEIGHT[methodToken] ?? 0.4;
}

function resolveTierWeight(tier, config = null) {
  if (config) {
    const key = `consensusTier${tier}Weight`;
    if (config[key] !== void 0 && config[key] !== null) return config[key];
  }
  return TIER_WEIGHT[tier] || 0.4;
}

function unknownFieldMap(fieldOrder) {
  const output = {};
  for (const field of fieldOrder) {
    output[field] = 'unk';
  }
  return output;
}

function hasValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return text !== '' && text !== 'unk';
}

function normalizePollingRate(value) {
  const nums = splitListValue(value).map((item) => parseNumber(item)).filter((item) => item !== null).map((item) => Math.round(item));
  const uniq = [...new Set(nums)].sort((a, b) => b - a);
  return uniq.length ? uniq.join(', ') : 'unk';
}

function canonicalValue(field, value) {
  if (!hasValue(value)) {
    return { display: 'unk', key: 'unk' };
  }
  if (field === 'polling_rate') {
    const display = normalizePollingRate(value);
    return { display, key: normalizeToken(display) };
  }
  if (NUMERIC_FIELDS.has(field)) {
    const num = parseNumber(value);
    if (num === null) {
      return { display: 'unk', key: 'unk' };
    }
    const rounded = Number.isInteger(num) ? num : Number.parseFloat(num.toFixed(2));
    return { display: String(rounded), key: String(rounded) };
  }
  if (LIST_FIELDS.has(field)) {
    const values = splitListValue(value).map((item) => normalizeWhitespace(item)).filter(Boolean);
    const display = values.length ? values.join(', ') : 'unk';
    return { display, key: normalizeToken(display) };
  }
  const display = normalizeWhitespace(value);
  return { display: display || 'unk', key: normalizeToken(display) || 'unk' };
}

function computePolicySignal(cluster, policy) {
  switch (policy) {
    case 'best_evidence': {
      return cluster.evidence.filter(
        (e) => e.citation?.snippetHash || e.citation?.snippetId
      ).length;
    }
    case 'prefer_deterministic': {
      return cluster.evidence.filter((e) => !LLM_METHODS.has(e.method)).length;
    }
    case 'prefer_llm': {
      return cluster.evidence.filter((e) => LLM_METHODS.has(e.method)).length;
    }
    case 'prefer_latest': {
      if (!cluster.evidence.length) return 0;
      return Math.max(
        ...cluster.evidence.map((e) => new Date(e.ts || 0).getTime())
      );
    }
    default:
      return 0;
  }
}

function applyPolicyBonus(clusters, policy, config = null) {
  if (!policy || policy === 'best_confidence' || clusters.length < 2) {
    return;
  }
  const policyBonus = Number.parseFloat(String(config?.consensusPolicyBonus ?? POLICY_BONUS));
  const safePolicyBonus = Number.isFinite(policyBonus) ? policyBonus : POLICY_BONUS;
  let bestSignal = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < clusters.length; i++) {
    const signal = computePolicySignal(clusters[i], policy);
    if (signal > bestSignal) {
      bestSignal = signal;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && bestSignal > 0) {
    clusters[bestIdx].score += safePolicyBonus;
  }
}

function passTargetForField(field, config = null) {
  const identityStrongTargetParsed = Number.parseInt(String(config?.consensusPassTargetIdentityStrong ?? 4), 10);
  const normalTargetParsed = Number.parseInt(String(config?.consensusPassTargetNormal ?? 2), 10);
  const identityStrongTarget = Number.isFinite(identityStrongTargetParsed) ? Math.max(1, identityStrongTargetParsed) : 4;
  const normalTarget = Number.isFinite(normalTargetParsed) ? Math.max(1, normalTargetParsed) : 2;
  if (PASS_EXEMPT_FIELDS.has(field)) {
    return 0;
  }
  if (COMMONLY_WRONG_FIELDS.has(field)) {
    return identityStrongTarget;
  }
  return normalTarget;
}

function selectBestCluster(clusters) {
  const ranked = [...clusters].sort((a, b) => {
    if (b.approvedDomainCount !== a.approvedDomainCount) {
      return b.approvedDomainCount - a.approvedDomainCount;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.display.localeCompare(b.display);
  });
  const best = ranked[0] || null;
  const second = ranked[1] || null;
  return { best, second };
}

function clusterCandidates(rows, config = null) {
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.clusterKey)) {
      byKey.set(row.clusterKey, {
        key: row.clusterKey,
        display: row.displayValue,
        score: 0,
        domains: new Set(),
        approvedDomains: new Set(),
        instrumentedDomains: new Set(),
        evidence: [],
      });
    }
    const cluster = byKey.get(row.clusterKey);
    const scoreAdd = resolveTierWeight(row.tier, config) * resolveMethodWeight(row.method, row.tier, config);
    if (row.approvedDomain) {
      cluster.score += scoreAdd;
    }
    cluster.domains.add(row.rootDomain);
    if (row.approvedDomain) {
      cluster.approvedDomains.add(row.rootDomain);
    }
    if (row.instrumentedHost && row.approvedDomain) {
      cluster.instrumentedDomains.add(row.rootDomain);
    }
    cluster.evidence.push(row);
  }
  return [...byKey.values()].map((cluster) => ({
    ...cluster,
    domainCount: cluster.domains.size,
    approvedDomainCount: cluster.approvedDomains.size,
    instrumentedDomainCount: cluster.instrumentedDomains.size,
  }));
}

function isInstrumentedEvidenceSource(source) {
  const rootDomain = String(source.rootDomain || '').toLowerCase();
  if (source.tierName === 'lab') {
    return true;
  }
  return INSTRUMENTED_HOST_HINTS.has(rootDomain);
}

function buildSnippetIndex(evidencePack = null) {
  const referencesById = new Map();
  const snippetsById = new Map();
  if (Array.isArray(evidencePack?.references)) {
    for (const row of evidencePack.references) {
      const id = String(row?.id || '').trim();
      if (!id) {
        continue;
      }
      referencesById.set(id, row);
    }
  }
  if (Array.isArray(evidencePack?.snippets)) {
    for (const row of evidencePack.snippets) {
      const id = String(row?.id || '').trim();
      if (!id) {
        continue;
      }
      snippetsById.set(id, row);
    }
  } else if (evidencePack?.snippets && typeof evidencePack.snippets === 'object') {
    for (const [id, row] of Object.entries(evidencePack.snippets || {})) {
      const key = String(id || '').trim();
      if (!key) {
        continue;
      }
      snippetsById.set(key, row);
    }
  }
  if (snippetsById.size === 0 && evidencePack?.snippets_by_id && typeof evidencePack.snippets_by_id === 'object') {
    for (const [id, row] of Object.entries(evidencePack.snippets_by_id || {})) {
      const key = String(id || '').trim();
      if (!key) {
        continue;
      }
      snippetsById.set(key, row);
    }
  }
  return {
    referencesById,
    snippetsById,
  };
}

function resolveCitationFromCandidate(source, candidate, evidenceIndexCache) {
  const evidenceRefs = Array.isArray(candidate?.evidenceRefs) ? [...new Set(candidate.evidenceRefs.map((id) => String(id || '').trim()).filter(Boolean))] : [];
  if (evidenceRefs.length === 0) {
    return null;
  }
  let index = evidenceIndexCache.get(source);
  if (!index) {
    index = buildSnippetIndex(source?.llmEvidencePack || null);
    evidenceIndexCache.set(source, index);
  }
  for (const refId of evidenceRefs) {
    const reference = index.referencesById.get(refId) || null;
    const snippet = index.snippetsById.get(refId) || null;
    const quote = normalizeWhitespace(snippet?.normalized_text || snippet?.text || reference?.content || '');
    const url = reference?.url || source?.finalUrl || source?.url;
    if (!url) {
      continue;
    }
    return {
      snippetId: refId,
      snippetHash: String(snippet?.snippet_hash || reference?.snippet_hash || '').trim(),
      sourceId: String(
        snippet?.source_id || source?.sourceId || source?.llmEvidencePack?.meta?.source_id || ''
      ).trim(),
      quote,
      retrievedAt: String(
        snippet?.retrieved_at || source?.llmEvidencePack?.meta?.updated_at || source?.ts || new Date().toISOString()
      ),
      extractionMethod: String(
        snippet?.extraction_method || candidate?.method || 'llm_extract'
      ).trim(),
      referenceUrl: url,
      fileUri: String(snippet?.file_uri || reference?.file_uri || '').trim(),
      mimeType: String(snippet?.mime_type || reference?.mime_type || '').trim(),
      contentHash: String(snippet?.content_hash || reference?.content_hash || '').trim(),
      surface: String(snippet?.surface || reference?.surface || '').trim(),
      evidenceRefs,
    };
  }
  return null;
}

function computeQuoteSpan(normalizedValue, quoteText) {
  const value = String(normalizedValue ?? '').trim();
  const quote = String(quoteText ?? '').trim();
  if (!value || !quote) return null;
  const idx = quote.toLowerCase().indexOf(value.toLowerCase());
  if (idx === -1) return null;
  return [idx, idx + value.length];
}

function runConsensusEngine({
  sourceResults,
  categoryConfig,
  fieldOrder,
  anchors,
  identityLock,
  productId,
  category,
  config = {},
  fieldRulesEngine = null,
}) {
  const fields = unknownFieldMap(fieldOrder);
  const provenance = {};
  const candidates = {};
  const fieldsBelowPassTarget = [];
  const criticalFieldsBelowPassTarget = [];
  const newValuesProposed = [];
  fields.id = productId;
  fields.brand = identityLock.brand || 'unk';
  fields.model = identityLock.model || 'unk';
  fields.base_model = identityLock.base_model || '';
  fields.category = category;
  fields.sku = identityLock.sku || 'unk';
  const usableSources = sourceResults.filter(
    (source) => source.identity?.match && (source.anchorCheck?.majorConflicts || []).length === 0
  );
  const evidenceIndexCache = new Map();
  const byField = new Map();
  for (const source of usableSources) {
    for (const candidate of source.fieldCandidates || []) {
      if (!candidate?.field || !hasValue(candidate.value)) {
        continue;
      }
      const normalized = canonicalValue(candidate.field, candidate.value);
      if (!hasValue(normalized.display)) {
        continue;
      }
      if (!byField.has(candidate.field)) {
        byField.set(candidate.field, []);
      }
      byField.get(candidate.field).push({
        field: candidate.field,
        value: normalized.display,
        displayValue: normalized.display,
        clusterKey: normalized.key,
        host: source.host,
        rootDomain: source.rootDomain,
        tier: source.tier,
        tierName: source.tierName,
        method: candidate.method,
        evidenceKey: `${source.url}#${candidate.keyPath}`,
        ts: source.ts || new Date().toISOString(),
        approvedDomain: Boolean(source.approvedDomain),
        instrumentedHost: Boolean(isInstrumentedEvidenceSource(source)),
        keyPath: candidate.keyPath,
        url: source.finalUrl || source.url,
        citation: resolveCitationFromCandidate(source, candidate, evidenceIndexCache),
        score: resolveTierWeight(source.tier, config) * resolveMethodWeight(candidate.method, source.tier, config),
      });
    }
  }
  let agreementAccumulator = 0;
  let agreementFieldCount = 0;
  for (const field of fieldOrder) {
    const rows = byField.get(field) || [];
    candidates[field] = rows.map((row, index) => ({
      candidate_id: buildFallbackFieldCandidateId({
        productId,
        fieldKey: field,
        value: row.value,
        index: index + 1,
        variant: 'candidate',
      }),
      value: row.value,
      score: Number.parseFloat(Math.max(0, Math.min(1, row.score || 0)).toFixed(6)),
      host: row.host,
      rootDomain: row.rootDomain,
      source_id: row.rootDomain ? row.rootDomain.replace(/[^a-z0-9]+/gi, '_').toLowerCase() : '',
      url: row.url,
      tier: row.tier,
      method: row.method,
      evidenceKey: row.evidenceKey,
      ts: row.ts,
      approvedDomain: row.approvedDomain,
      evidence: {
        url: row.url,
        snippet_id: row.citation?.snippetId || '',
        snippet_hash: row.citation?.snippetHash || '',
        source_id: row.citation?.sourceId || '',
        quote: row.citation?.quote || '',
        file_uri: row.citation?.fileUri || '',
        mime_type: row.citation?.mimeType || '',
        content_hash: row.citation?.contentHash || '',
        surface: row.citation?.surface || '',
        quote_span: computeQuoteSpan(row.value, row.citation?.quote || ''),
        snippet_text: row.citation?.quote || '',
      },
    }));
    const anchorValue = anchors?.[field];
    if (hasValue(anchorValue)) {
      const normalizedAnchor = canonicalValue(field, anchorValue).display;
      fields[field] = normalizedAnchor;
      provenance[field] = {
        value: normalizedAnchor,
        anchor_locked: true,
        confirmations: 0,
        approved_confirmations: 0,
        pass_target: 1,
        meets_pass_target: true,
        confidence: 1,
        evidence: [],
      };
      continue;
    }
    if (PASS_EXEMPT_FIELDS.has(field)) {
      provenance[field] = {
        value: fields[field],
        anchor_locked: false,
        confirmations: 0,
        approved_confirmations: 0,
        pass_target: 0,
        meets_pass_target: true,
        confidence: fields[field] === 'unk' ? 0 : 1,
        evidence: [],
      };
      continue;
    }
    if (!rows.length) {
      provenance[field] = {
        value: 'unk',
        anchor_locked: false,
        confirmations: 0,
        approved_confirmations: 0,
        pass_target: passTargetForField(field, config),
        meets_pass_target: false,
        confidence: 0,
        evidence: [],
      };
      fieldsBelowPassTarget.push(field);
      if (categoryConfig.criticalFieldSet.has(field)) {
        criticalFieldsBelowPassTarget.push(field);
      }
      continue;
    }
    const clusters = clusterCandidates(rows, config);
    const fieldRule = fieldRulesEngine?.getFieldRule?.(field);
    const selectionPolicy = typeof fieldRule?.selection_policy === 'string' ? fieldRule.selection_policy : null;
    if (selectionPolicy) {
      applyPolicyBonus(clusters, selectionPolicy, config);
    }
    const { best, second } = selectBestCluster(clusters);
    const weightedMajorityThresholdParsed = Number.parseFloat(String(config?.consensusWeightedMajorityThreshold ?? 1.1));
    const weightedMajorityThreshold = Number.isFinite(weightedMajorityThresholdParsed) ? Math.max(1, weightedMajorityThresholdParsed) : 1.1;
    const weightedMajority = !second || best.score >= second.score * weightedMajorityThreshold;
    const minimumRequiredParsed = Number.parseInt(String(config?.consensusStrictAcceptanceDomainCount ?? 2), 10);
    const minimumRequired = Number.isFinite(minimumRequiredParsed) ? Math.max(1, minimumRequiredParsed) : 2;
    const relaxedMinimumParsed = Number.parseInt(String(config?.consensusRelaxedAcceptanceDomainCount ?? 2), 10);
    const relaxedMinimum = Number.isFinite(relaxedMinimumParsed) ? Math.max(1, relaxedMinimumParsed) : 2;
    const instrumentedThresholdParsed = Number.parseInt(String(config?.consensusInstrumentedFieldThreshold ?? 3), 10);
    const instrumentedThreshold = Number.isFinite(instrumentedThresholdParsed) ? Math.max(1, instrumentedThresholdParsed) : 3;
    const approvedDomainCount = best?.approvedDomainCount || 0;
    const instrumentedCount = best?.instrumentedDomainCount || 0;
    const strictAccepted = approvedDomainCount >= minimumRequired && weightedMajority;
    const relaxedCandidate = Boolean(config.allowBelowPassTargetFill) && !INSTRUMENTED_FIELDS.has(field);
    let relaxedAccepted = false;
    if (relaxedCandidate && approvedDomainCount >= relaxedMinimum && weightedMajority) {
      const approvedEvidence = (best?.evidence || []).filter((item) => item.approvedDomain);
      const hasTier1Manufacturer = approvedEvidence.some(
        (item) => item.tier === 1 && item.tierName === 'manufacturer'
      );
      const additionalCredibleDomains = new Set(
        approvedEvidence.filter((item) => item.tier <= 2).filter((item) => !(item.tier === 1 && item.tierName === 'manufacturer')).map((item) => item.rootDomain)
      );
      relaxedAccepted = hasTier1Manufacturer && additionalCredibleDomains.size >= 1;
    }
    let accepted = strictAccepted || relaxedAccepted;
    if (INSTRUMENTED_FIELDS.has(field)) {
      accepted = strictAccepted && instrumentedCount >= instrumentedThreshold;
      relaxedAccepted = false;
    }
    const value = accepted ? best.display : 'unk';
    fields[field] = value;
    const passTarget = passTargetForField(field, config);
    const meetsPassTarget = approvedDomainCount >= passTarget;
    if (!meetsPassTarget) {
      fieldsBelowPassTarget.push(field);
      if (categoryConfig.criticalFieldSet.has(field)) {
        criticalFieldsBelowPassTarget.push(field);
      }
    }
    const confidenceBaseParsed = Number.parseFloat(String(config?.consensusConfidenceScoringBase ?? 0.7));
    const confidenceBaseDefault = Number.isFinite(confidenceBaseParsed) ? Math.max(0, Math.min(1, confidenceBaseParsed)) : 0.7;
    const confidenceBase = approvedDomainCount >= minimumRequired ? confidenceBaseDefault : approvedDomainCount / 4;
    const confidenceScore = Math.max(
      0,
      Math.min(1, confidenceBase + (weightedMajority ? 0.2 : 0) + Math.min(0.1, best.score / 10))
    );
    provenance[field] = {
      value,
      anchor_locked: false,
      confirmations: best.domainCount,
      approved_confirmations: approvedDomainCount,
      instrumented_confirmations: instrumentedCount,
      pass_target: passTarget,
      meets_pass_target: meetsPassTarget,
      accepted_below_pass_target: relaxedAccepted && !meetsPassTarget,
      weighted_majority: weightedMajority,
      confidence: confidenceScore,
      domains: [...best.domains],
      approved_domains: [...best.approvedDomains],
      evidence: best.evidence.map((evidence) => ({
        url: evidence.url,
        host: evidence.host,
        rootDomain: evidence.rootDomain,
        tier: evidence.tier,
        tierName: evidence.tierName,
        method: evidence.method,
        keyPath: evidence.keyPath,
        approvedDomain: evidence.approvedDomain,
        snippet_id: evidence.citation?.snippetId || '',
        snippet_hash: evidence.citation?.snippetHash || '',
        source_id: evidence.citation?.sourceId || '',
        quote: evidence.citation?.quote || '',
        file_uri: evidence.citation?.fileUri || '',
        mime_type: evidence.citation?.mimeType || '',
        content_hash: evidence.citation?.contentHash || '',
        surface: evidence.citation?.surface || '',
        retrieved_at: evidence.citation?.retrievedAt || evidence.ts,
        extraction_method: evidence.citation?.extractionMethod || evidence.method,
        evidence_refs: evidence.citation?.evidenceRefs || [],
      })),
    };
    agreementAccumulator += second ? best.score / (best.score + second.score) : 1;
    agreementFieldCount += 1;
  }
  if (fields.connection === 'wired' && fields.battery_hours === 'unk') {
    fields.battery_hours = 'n/a';
    if (provenance.battery_hours) {
      provenance.battery_hours.value = 'n/a';
      provenance.battery_hours.meets_pass_target = true;
    }
  }
  return {
    fields,
    provenance,
    candidates,
    fieldsBelowPassTarget: [...new Set(fieldsBelowPassTarget)],
    criticalFieldsBelowPassTarget: [...new Set(criticalFieldsBelowPassTarget)],
    newValuesProposed,
    agreementScore: agreementFieldCount ? agreementAccumulator / agreementFieldCount : 0,
  };
}

function applySelectionPolicyReducers({ fields, candidates, fieldRulesEngine }) {
  const result = { fields: { ...fields }, applied: [] };
  if (!fieldRulesEngine) {
    return result;
  }
  for (const field of fieldRulesEngine.getAllFieldKeys()) {
    const rule = fieldRulesEngine.getFieldRule(field);
    const policy = rule?.selection_policy;
    if (!policy || typeof policy !== 'object') {
      continue;
    }
    if (!policy.source_field) {
      continue;
    }
    const sourceFieldCandidates = candidates[policy.source_field];
    if (!sourceFieldCandidates || sourceFieldCandidates.length === 0) {
      continue;
    }
    const values = sourceFieldCandidates.map((c) => Number.parseFloat(c.value)).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    if (values.length === 0) {
      continue;
    }
    if (values.length === 1) {
      result.fields[field] = String(values[0]);
      result.applied.push({ field, reason: 'single_value', value: values[0] });
      continue;
    }
    const tolerance = policy.tolerance_ms || 0;
    const range = values[values.length - 1] - values[0];
    if (range <= tolerance) {
      const mid = Math.floor(values.length / 2);
      const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
      result.fields[field] = String(median);
      result.applied.push({ field, reason: 'median_within_tolerance', value: median });
    } else {
      result.fields[field] = 'unk';
      result.applied.push({ field, reason: 'exceeds_tolerance', range, tolerance });
    }
  }
  return result;
}

// --- List union reducer (from src/scoring/listUnionReducer.js) ---

function hasKnownValue(value) {
  const token = String(value ?? '').trim().toLowerCase();
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a';
}

function dedupeKey(item) {
  return String(item).trim().toLowerCase();
}

function sortCandidatesByRank(candidates) {
  return [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function applyUnion(winnerItems, rankedCandidates) {
  const seen = new Set(winnerItems.map(dedupeKey));
  const merged = [...winnerItems];
  for (const candidate of rankedCandidates) {
    const items = splitListValue(candidate.value);
    for (const item of items) {
      const key = dedupeKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }
  return merged;
}

function applyListUnionReducers({ fields, candidates, fieldRulesEngine }) {
  const result = { fields: { ...fields }, applied: [] };
  if (!fieldRulesEngine) {
    return result;
  }
  for (const field of fieldRulesEngine.getAllFieldKeys()) {
    const rule = fieldRulesEngine.getFieldRule(field);
    const policy = rule?.contract?.list_rules?.item_union;
    if (!policy || !SUPPORTED_POLICIES.has(policy)) {
      continue;
    }
    const winnerValue = result.fields[field];
    if (!hasKnownValue(winnerValue)) {
      continue;
    }
    const fieldCandidates = candidates[field];
    if (!Array.isArray(fieldCandidates) || fieldCandidates.length < 2) {
      continue;
    }
    const approvedCandidates = fieldCandidates.filter((c) => c.approvedDomain);
    if (approvedCandidates.length < 2) {
      continue;
    }
    const winnerItems = splitListValue(winnerValue);
    const ranked = sortCandidatesByRank(approvedCandidates);
    const merged = applyUnion(winnerItems, ranked);
    if (merged.length === winnerItems.length) {
      continue;
    }
    const addedCount = merged.length - winnerItems.length;
    result.fields[field] = merged.join(', ');
    result.applied.push({
      field,
      policy,
      before_count: winnerItems.length,
      after_count: merged.length,
      added_count: addedCount,
    });
  }
  return result;
}

// --- Normalizer (from src/normalizer/mouseNormalizer.js) ---

function buildIdentityObject(job, extractedIdentity = {}, options = {}) {
  const lock = job.identityLock || {};
  const allowDerivedVariant = Boolean(options.allowDerivedVariant);
  const brand = lock.brand || extractedIdentity.brand || 'unk';
  const model = lock.model || extractedIdentity.model || 'unk';
  const sku = lock.sku || extractedIdentity.sku || 'unk';
  const extractedVariant = String(extractedIdentity.variant || '').trim();
  const variant = lock.variant || (allowDerivedVariant && extractedVariant ? extractedVariant : 'unk');
  return {
    id: lock.id || 0,
    identifier: lock.identifier || '',
    brand,
    model,
    base_model: lock.base_model || extractedIdentity.base_model || '',
    variant,
    sku,
    mpn: lock.mpn || extractedIdentity.mpn || 'unk',
    gtin: lock.gtin || extractedIdentity.gtin || 'unk',
  };
}

function buildValidatedNormalized({
  productId,
  runId,
  category,
  identity,
  fields,
  quality,
  sourceSummary,
}) {
  return {
    productId,
    runId,
    category,
    identity,
    fields,
    quality,
    sources: sourceSummary,
  };
}

// --- Quality scoring (from src/scoring/qualityScoring.js) ---

function computeCompletenessRequired(normalized, requiredFieldsInput = []) {
  const requiredFields = requiredFieldsInput.map((path) => normalizeRequiredFieldPath(path)).filter(Boolean);
  const total = requiredFields.length;
  const missingRequiredFields = [];
  let filled = 0;
  for (const fieldPath of requiredFields) {
    const value = getByPath(normalized, fieldPath);
    if (valueFilled(value)) {
      filled += 1;
    } else {
      missingRequiredFields.push(fieldPath);
    }
  }
  const completenessRequired = total === 0 ? 0 : filled / total;
  return {
    requiredFields,
    missingRequiredFields,
    filled,
    total,
    completenessRequired,
  };
}

function computeCoverageOverall({ fields, fieldOrder, editorialFields }) {
  const editorialSet = new Set(editorialFields || []);
  const consideredFields = (fieldOrder || []).filter((field) => !editorialSet.has(field));
  let filled = 0;
  for (const field of consideredFields) {
    if (valueFilled(fields[field])) {
      filled += 1;
    }
  }
  const total = consideredFields.length;
  const coverageOverall = total === 0 ? 0 : filled / total;
  return {
    total,
    filled,
    coverageOverall,
    consideredFields,
  };
}

function computeConfidence({
  identityConfidence,
  provenance,
  anchorConflictsCount,
  agreementScore = 0,
}) {
  const confidences = Object.values(provenance || {}).map((row) => row.confidence).filter((value) => typeof value === 'number' && Number.isFinite(value));
  const provenanceConfidence = confidences.length ? confidences.reduce((acc, value) => acc + value, 0) / confidences.length : 0;
  let confidence = identityConfidence * 0.5 + provenanceConfidence * 0.35 + agreementScore * 0.15;
  confidence -= Math.min(0.4, anchorConflictsCount * 0.06);
  return clamp(confidence, 0, 1);
}

// --- Validation gate (from src/features/indexing/validation/qualityGate.js) ---

function toPercent(value) {
  return Number.parseFloat((value * 100).toFixed(2));
}

function evaluateValidationGate({
  identityGateValidated = true,
  identityConfidence,
  qualityGateIdentityThreshold = 0.7,
  anchorMajorConflictsCount,
  completenessRequired,
  targetCompleteness,
  confidence,
  targetConfidence,
  criticalFieldsBelowPassTarget,
}) {
  const criticalMissing = criticalFieldsBelowPassTarget || [];
  const checks = {
    identity_gate_ok: Boolean(identityGateValidated),
    identity_confidence_ok: identityConfidence >= qualityGateIdentityThreshold,
    anchor_conflicts_ok: anchorMajorConflictsCount === 0,
    required_completeness_ok: completenessRequired >= targetCompleteness,
    confidence_ok: confidence >= targetConfidence,
    critical_fields_ok: criticalMissing.length === 0,
  };
  const reasons = [];
  if (!checks.identity_gate_ok) {
    reasons.push('MODEL_AMBIGUITY_ALERT');
  }
  if (!checks.identity_confidence_ok) {
    reasons.push('MODEL_AMBIGUITY_ALERT');
  }
  if (!checks.anchor_conflicts_ok) {
    reasons.push('HAS_ANCHOR_CONFLICTS');
  }
  if (!checks.required_completeness_ok) {
    reasons.push('BELOW_REQUIRED_COMPLETENESS');
  }
  if (!checks.confidence_ok) {
    reasons.push('BELOW_CONFIDENCE_THRESHOLD');
  }
  if (!checks.critical_fields_ok) {
    reasons.push('CRITICAL_FIELDS_BELOW_PASS_TARGET');
  }
  const uniqueReasons = [...new Set(reasons)];
  return {
    validated: uniqueReasons.length === 0,
    validatedReason: uniqueReasons.length === 0 ? 'OK' : uniqueReasons[0],
    reasons: uniqueReasons,
    checks,
    targetCompleteness,
    targetConfidence,
    completenessRequiredPercent: toPercent(completenessRequired),
    coverageOverallPercent: null,
    confidencePercent: toPercent(confidence),
  };
}

// --- Constraint solver (from src/scoring/constraintSolver.js) ---

function round4(value, digits = 4) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

function hasConstraintValue(value) {
  const token = String(value || '').trim().toLowerCase();
  return token !== '' && token !== 'unk';
}

function parseBoolean(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token || token === 'unk') {
    return null;
  }
  if (['yes', 'true', '1', 'y', 'on', 'supported', 'enabled'].includes(token)) {
    return true;
  }
  if (['no', 'false', '0', 'n', 'off', 'disabled'].includes(token)) {
    return false;
  }
  return null;
}

function includesToken(value, token) {
  return String(value || '').toLowerCase().includes(String(token || '').toLowerCase());
}

function addContradiction(rows, contradiction) {
  rows.push({
    ...contradiction,
    severity: contradiction.severity || 'warning',
    fields: contradiction.fields || [],
    code: contradiction.code || 'constraint_violation',
  });
}

function ruleWirelessNeedsBattery(fields, contradictions) {
  const connection = String(fields.connection || '').toLowerCase();
  const battery = String(fields.battery_hours || '').toLowerCase();
  if (!connection || connection === 'unk') {
    return;
  }
  if ((connection.includes('wireless') || connection.includes('dual')) && (battery === 'unk' || battery === 'n/a')) {
    addContradiction(contradictions, {
      code: 'wireless_missing_battery_hours',
      severity: 'warning',
      fields: ['connection', 'battery_hours'],
      message: 'Wireless-capable connection but battery_hours is unknown.',
    });
  }
  if (connection === 'wired') {
    const parsed = parseNumber(battery);
    if (parsed !== null && parsed > 0) {
      addContradiction(contradictions, {
        code: 'wired_has_battery_hours',
        severity: 'warning',
        fields: ['connection', 'battery_hours'],
        message: 'Wired connection should not report battery_hours > 0.',
        observed: battery,
      });
    }
  }
}

function ruleBluetoothNeedsWireless(fields, contradictions) {
  const bluetooth = parseBoolean(fields.bluetooth);
  const connection = String(fields.connection || '').toLowerCase();
  const connectivity = String(fields.connectivity || '').toLowerCase();
  if (bluetooth !== true) {
    return;
  }
  const hasWirelessSignal = includesToken(connection, 'wireless') || includesToken(connection, 'dual') || includesToken(connectivity, 'wireless') || includesToken(connectivity, 'bluetooth');
  if (!hasWirelessSignal) {
    addContradiction(contradictions, {
      code: 'bluetooth_without_wireless',
      severity: 'error',
      fields: ['bluetooth', 'connection', 'connectivity'],
      message: 'Bluetooth is enabled but connection/connectivity has no wireless signal.',
    });
  }
}

function ruleDimensionSanity(fields, contradictions) {
  const length = parseNumber(fields.lngth);
  const width = parseNumber(fields.width);
  const height = parseNumber(fields.height);
  const dims = [
    ['lngth', length],
    ['width', width],
    ['height', height],
  ];
  for (const [field, value] of dims) {
    if (value === null) {
      continue;
    }
    if (value <= 0 || value > 300) {
      addContradiction(contradictions, {
        code: 'dimension_out_of_range',
        severity: 'error',
        fields: [field],
        message: `${field} value is outside expected physical range.`,
        observed: String(value),
      });
    }
  }
  if (length !== null && width !== null && width > length * 1.25) {
    addContradiction(contradictions, {
      code: 'width_exceeds_length',
      severity: 'warning',
      fields: ['lngth', 'width'],
      message: 'Width is unexpectedly larger than length.',
    });
  }
}

function parsePollingValues(value) {
  return splitListValue(value).map((item) => parseNumber(item)).filter((item) => item !== null);
}

function rulePerformanceSanity(fields, contradictions) {
  const pollingValues = parsePollingValues(fields.polling_rate);
  if (pollingValues.length) {
    const maxPolling = Math.max(...pollingValues);
    const minPolling = Math.min(...pollingValues);
    if (maxPolling > 1e4 || minPolling < 125) {
      addContradiction(contradictions, {
        code: 'polling_rate_out_of_range',
        severity: 'warning',
        fields: ['polling_rate'],
        message: 'Polling rate appears outside expected range (125-10000Hz).',
        observed: String(fields.polling_rate || ''),
      });
    }
  }
  const dpi = parseNumber(fields.dpi);
  if (dpi !== null && (dpi < 100 || dpi > 1e5)) {
    addContradiction(contradictions, {
      code: 'dpi_out_of_range',
      severity: 'warning',
      fields: ['dpi'],
      message: 'DPI appears outside expected range (100-100000).',
      observed: String(fields.dpi || ''),
    });
  }
  const ips = parseNumber(fields.ips);
  if (ips !== null && (ips < 40 || ips > 1200)) {
    addContradiction(contradictions, {
      code: 'ips_out_of_range',
      severity: 'warning',
      fields: ['ips'],
      message: 'IPS appears outside expected range (40-1200).',
      observed: String(fields.ips || ''),
    });
  }
}

function ruleDependencyPairs(fields, contradictions) {
  if (hasConstraintValue(fields.sensor_brand) && !hasConstraintValue(fields.sensor)) {
    addContradiction(contradictions, {
      code: 'sensor_brand_without_sensor',
      severity: 'warning',
      fields: ['sensor_brand', 'sensor'],
      message: 'sensor_brand is present while sensor is unknown.',
    });
  }
  if (hasConstraintValue(fields.switch_brand) && !hasConstraintValue(fields.switch)) {
    addContradiction(contradictions, {
      code: 'switch_brand_without_switch',
      severity: 'warning',
      fields: ['switch_brand', 'switch'],
      message: 'switch_brand is present while switch is unknown.',
    });
  }
}

function fieldConfidence(provenanceRow) {
  if (!provenanceRow || typeof provenanceRow !== 'object') {
    return 0;
  }
  const confidence = Number.parseFloat(String(provenanceRow.confidence ?? 0));
  return Number.isFinite(confidence) ? confidence : 0;
}

function severityPenalty(severity) {
  if (severity === 'error') {
    return 0.25;
  }
  if (severity === 'warning') {
    return 0.12;
  }
  return 0.08;
}

function buildFieldUncertainty(fields, provenance, contradictions, criticalFieldSet) {
  const map = {};
  const penalties = {};
  for (const contradiction of contradictions || []) {
    for (const field of contradiction.fields || []) {
      penalties[field] = (penalties[field] || 0) + severityPenalty(contradiction.severity);
    }
  }
  for (const field of Object.keys(fields || {})) {
    const value = fields[field];
    const confidence = fieldConfidence(provenance?.[field]);
    let uncertainty = hasConstraintValue(value) ? Math.max(0, 1 - confidence) : 0.9;
    if (criticalFieldSet?.has(field) && !hasConstraintValue(value)) {
      uncertainty += 0.08;
    }
    if (provenance?.[field]?.meets_pass_target === false) {
      uncertainty += 0.07;
    }
    uncertainty += penalties[field] || 0;
    map[field] = round4(Math.max(0, Math.min(1, uncertainty)), 6);
  }
  return map;
}

// WHY: constraint graph uses ONLY contract-driven cross-validation failures
// from the field rules engine. Hardcoded mouse-specific rules (wireless/battery,
// bluetooth, dimensions, polling_rate, sensor_brand) were removed — those
// constraints belong in the category's cross_validation_rules.json, not in code.
function evaluateConstraintGraph({
  fields = {},
  provenance = {},
  criticalFieldSet = new Set(),
  crossValidationFailures = [],
}) {
  const contradictions = [];
  for (const failure of crossValidationFailures) {
    if (failure.reason_code === 'compound_range_conflict') {
      addContradiction(contradictions, {
        code: 'compound_range_conflict',
        severity: 'error',
        fields: [failure.field_key],
        message: `${failure.field_key} value ${failure.actual} outside compound range [${failure.effective_min ?? '?'}, ${failure.effective_max ?? '?'}]`,
      });
    }
  }
  const field_uncertainty = buildFieldUncertainty(fields, provenance, contradictions, criticalFieldSet);
  const values = Object.values(field_uncertainty);
  const global_uncertainty = values.length ? round4(values.reduce((sum, value) => sum + value, 0) / values.length, 6) : 0;
  const top_uncertain_fields = Object.entries(field_uncertainty).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([field, uncertainty]) => ({ field, uncertainty }));
  return {
    contradiction_count: contradictions.length,
    contradictions,
    field_uncertainty,
    global_uncertainty,
    top_uncertain_fields,
  };
}

// --- Summary / reasoning (from src/testing/testRunner.js + src/exporter/exporter.js) ---

function compactSummary(summary) {
  return {
    productId: summary.productId,
    runId: summary.runId,
    validated: summary.validated,
    reason: summary.reason,
    validated_reason: summary.validated_reason,
    validation_reasons: summary.validation_reasons || [],
    confidence: summary.confidence,
    completeness_required_percent: summary.completeness_required_percent,
    coverage_overall_percent: summary.coverage_overall_percent,
    missing_required_fields: summary.missing_required_fields || [],
    fields_below_pass_target: summary.fields_below_pass_target || [],
    critical_fields_below_pass_target: summary.critical_fields_below_pass_target || [],
    anchor_conflicts: summary.anchor_conflicts || [],
    identity_confidence: summary.identity_confidence,
    identity_gate_validated: summary.identity_gate_validated,
    publishable: typeof summary.publishable === 'boolean' ? summary.publishable : Boolean(summary.validated),
    publish_blockers: summary.publish_blockers || [],
    identity_report: summary.identity_report || null,
    constraint_analysis: summary.constraint_analysis || {},
    runtime_engine: summary.runtime_engine || {},
    field_reasoning: summary.field_reasoning || {},
    needset: summary.needset || null,
    parser_health: summary.parser_health || {},
    temporal_evidence: summary.temporal_evidence || {},
    endpoint_mining: summary.endpoint_mining || {},
    fields_below_pass_target_count: (summary.fields_below_pass_target || []).length,
    anchor_conflicts_count: (summary.anchor_conflicts || []).length,
    duration_ms: summary.duration_ms,
    generated_at: summary.generated_at,
  };
}

function ensureProvenanceField(provenance, field, defaultValue = 'unk') {
  if (!provenance[field]) {
    provenance[field] = {
      value: defaultValue,
      confidence: 0,
      evidence: [],
      meets_pass_target: false,
    };
  }
  return provenance[field];
}

function collectContributionFields({ fieldOrder, normalized, provenance }) {
  const llmFields = [];
  const componentFields = [];
  for (const field of fieldOrder || []) {
    if (!hasKnownFieldValue(normalized?.fields?.[field])) continue;
    const prov = provenance?.[field];
    if (!prov) continue;
    const topMethod = (prov.evidence || [])[0]?.method || '';
    if (topMethod.includes('llm') || topMethod === 'test_inject') llmFields.push(field);
    if (topMethod.includes('component')) componentFields.push(field);
  }
  return { llmFields, componentFields };
}

function buildFieldReasoning({ fieldOrder, provenance, fieldsBelowPassTarget, criticalFieldsBelowPassTarget, missingRequiredFields }) {
  const reasoning = {};
  const belowSet = new Set(fieldsBelowPassTarget || []);
  const criticalSet = new Set(criticalFieldsBelowPassTarget || []);
  const missingSet = new Set(missingRequiredFields || []);
  for (const field of fieldOrder || []) {
    const reasons = [];
    if (belowSet.has(field)) reasons.push('below_pass_target');
    if (criticalSet.has(field)) reasons.push('critical_below_pass_target');
    if (missingSet.has(field)) reasons.push('missing_required_field');
    const prov = provenance?.[field];
    reasoning[field] = {
      reasons,
      confidence: prov?.confidence || 0,
      meets_pass_target: prov?.meets_pass_target ?? false,
      source_count: (prov?.evidence || []).length,
    };
  }
  return reasoning;
}

function buildTopEvidenceReferences(provenance, limit = 100) {
  const refs = [];
  for (const [field, prov] of Object.entries(provenance || {})) {
    for (const ev of (prov?.evidence || []).slice(0, 3)) {
      refs.push({ field, url: ev.url || '', host: ev.host || '', tier: ev.tier, method: ev.method });
    }
  }
  return refs.slice(0, limit);
}

// --- Utility (from src/exporter/exporter.js) ---

function jsonBuffer(value) {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8');
}

// --- Exports ---

export {
  // Constants
  INSTRUMENTED_FIELDS,
  COMMONLY_WRONG_FIELDS,
  NUMERIC_FIELDS,
  LIST_FIELDS,
  INSTRUMENTED_HOST_HINTS,
  METHOD_WEIGHT,
  TIER_WEIGHT,
  PASS_EXEMPT_FIELDS,
  POLICY_BONUS,
  LLM_METHODS,
  SUPPORTED_POLICIES,
  IDENTITY_FIELDS,
  FIELD_ALIASES,

  // Common utilities
  normalizeWhitespace,
  normalizeToken,
  splitListValue,
  parseNumber,
  clamp,
  getByPath,
  valueFilled,
  hasKnownFieldValue,

  // Candidate identifier
  candidateNormalizeToken,
  serializePart,
  hashParts,
  tokenPart,
  buildCandidateId,
  buildFallbackFieldCandidateId,

  // Field keys
  cleanToken,
  canonicalFieldMap,
  normalizeTail,
  toRawFieldKey,
  normalizeRequiredFieldPath,

  // Consensus engine
  resolveParsingConfidenceBaseMap,
  resolveMethodWeight,
  resolveTierWeight,
  unknownFieldMap,
  hasValue,
  normalizePollingRate,
  canonicalValue,
  computePolicySignal,
  applyPolicyBonus,
  passTargetForField,
  selectBestCluster,
  clusterCandidates,
  isInstrumentedEvidenceSource,
  buildSnippetIndex,
  resolveCitationFromCandidate,
  computeQuoteSpan,
  runConsensusEngine,
  applySelectionPolicyReducers,

  // List union reducer
  hasKnownValue,
  dedupeKey,
  sortCandidatesByRank,
  applyUnion,
  applyListUnionReducers,

  // Normalizer
  buildIdentityObject,
  buildValidatedNormalized,

  // Quality scoring
  computeCompletenessRequired,
  computeCoverageOverall,
  computeConfidence,

  // Validation gate
  toPercent,
  evaluateValidationGate,

  // Constraint solver
  round4,
  hasConstraintValue,
  parseBoolean,
  includesToken,
  addContradiction,
  ruleWirelessNeedsBattery,
  ruleBluetoothNeedsWireless,
  ruleDimensionSanity,
  rulePerformanceSanity,
  ruleDependencyPairs,
  fieldConfidence,
  severityPenalty,
  buildFieldUncertainty,
  evaluateConstraintGraph,

  // Summary / reasoning
  compactSummary,
  ensureProvenanceField,
  collectContributionFields,
  buildFieldReasoning,
  buildTopEvidenceReferences,

  // Utility
  jsonBuffer,
};
