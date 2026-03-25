// archetypeQueryPlanner.js — Source-first archetype query planner
// Replaces field-first query generation with source-archetype-driven planning.
// All pure functions. Zero module state.
//
// Learning loop coupling:
//   Within-run: _meta on query rows carries archetype + query_family for gap analysis
//   Across-run: query_templates.json (with archetype provenance), field_lexicon.json,
//               field_yield.json, SQLite stores — all with soft decay

import { isLowValueSubdomain } from '../../../shared/valueNormalizers.js';
import { normalizeHost } from '../pipeline/shared/hostParser.js';

const ARCHETYPE_ORDER = ['manufacturer', 'lab_review', 'spec_database', 'aggregator', 'retailer', 'community'];

const INFER_FIRST_FIELDS = new Set([
  'coating', 'feet_material', 'feet_shape', 'feet_layers',
  'cable_type', 'cable_material', 'cable_length'
]);

const NEVER_SEARCH_FIELDS = new Set([
  'discontinued', 'product_url', 'image_url', 'brand', 'model', 'variant',
  'category', 'product_id'
]);

const COMMERCE_FIELDS = new Set([
  'weight', 'colors', 'price_range', 'battery_hours', 'lngth', 'width', 'height'
]);

// WHY: V1 budget ratios — lab + manufacturer get bulk, community is 0
const V1_BUDGET_RATIOS = {
  manufacturer: 0.15,
  lab_review: 0.35,
  spec_database: 0.20,
  aggregator: 0.10,
  retailer: 0,
  community: 0
};

// ── classifySourceArchetypes ──

export function classifySourceArchetypes(sourceRegistry, sourceHosts, manufacturerHosts) {
  const byArchetype = new Map();

  // Classify from registry entries by discovery.source_type
  for (const [, source] of Object.entries(sourceRegistry || {})) {
    const sourceType = source?.discovery?.source_type;
    if (!sourceType) continue;

    const baseUrl = source.base_url || '';
    const host = extractHostFromUrl(baseUrl);
    if (!host) continue;

    if (!byArchetype.has(sourceType)) {
      byArchetype.set(sourceType, { archetype: sourceType, hosts: [], coveredFields: [], sources: [] });
    }
    const bucket = byArchetype.get(sourceType);
    if (!bucket.hosts.includes(host)) {
      bucket.hosts.push(host);
    }
    bucket.sources.push(source);

    const coverage = source.field_coverage;
    if (coverage) {
      const fields = [
        ...(coverage.high || []),
        ...(coverage.medium || []),
        ...(coverage.low || [])
      ];
      for (const f of fields) {
        if (!bucket.coveredFields.includes(f)) {
          bucket.coveredFields.push(f);
        }
      }
    }
  }

  // Manufacturer archetype from manufacturerHosts (even if not in registry)
  const mfrHosts = Array.isArray(manufacturerHosts) ? manufacturerHosts.filter(Boolean) : [];
  if (mfrHosts.length > 0) {
    if (!byArchetype.has('manufacturer')) {
      byArchetype.set('manufacturer', { archetype: 'manufacturer', hosts: [], coveredFields: [], sources: [] });
    }
    const mfr = byArchetype.get('manufacturer');
    for (const host of mfrHosts) {
      // WHY: support/forum/blog subdomains waste budget slots — urlQualityGate rejects them at fetch time anyway
      if (!mfr.hosts.includes(host) && !isLowValueSubdomain(host)) {
        mfr.hosts.push(host);
      }
    }
  }

  // WHY: Do NOT blindly add all manufacturer-role sourceHosts — they include competitor
  // hosts (razer.com for a Logitech product). Only brand-resolved manufacturerHosts
  // belong in the manufacturer archetype.

  const result = [];
  for (const type of ARCHETYPE_ORDER) {
    if (byArchetype.has(type)) {
      result.push(byArchetype.get(type));
    }
  }
  // Include any types not in ARCHETYPE_ORDER
  for (const [type, bucket] of byArchetype) {
    if (!ARCHETYPE_ORDER.includes(type)) {
      result.push(bucket);
    }
  }

  return result;
}

// ── computeArchetypeCoverage ──

export function computeArchetypeCoverage(archetypes, focusFields) {
  const fieldSet = new Set(focusFields || []);
  const fieldCount = fieldSet.size || 1;

  const coverage = (archetypes || []).map((a) => {
    const covered = (a.coveredFields || []).filter((f) => fieldSet.has(f));
    return {
      archetype: a.archetype,
      hosts: a.hosts,
      coveredFields: a.coveredFields,
      sources: a.sources,
      coverageRatio: covered.length / fieldCount,
      coveredFocusFields: covered
    };
  });

  coverage.sort((a, b) => b.coverageRatio - a.coverageRatio);
  return coverage;
}

// ── allocateArchetypeBudget ──

export function allocateArchetypeBudget(archetypes, budget, context) {
  const totalBudget = Math.max(1, Number(budget) || 24);
  const missingCommerce = context?.missingCommerceFields || [];
  const hasCommerceGap = missingCommerce.length >= 2;

  const allocation = [];
  let spent = 0;

  for (const archetype of (archetypes || [])) {
    const type = archetype.archetype;
    let ratio = V1_BUDGET_RATIOS[type] ?? 0.05;

    // Retailer gate: off by default, fires if commerce fields missing
    if (type === 'retailer') {
      ratio = hasCommerceGap ? 0.10 : 0;
    }

    const slots = Math.floor(totalBudget * ratio);
    allocation.push({
      archetype: type,
      hosts: archetype.hosts || [],
      slots,
      coveredFields: archetype.coveredFields || []
    });
    spent += slots;
  }

  // Leftover budget → base_template + learned + hard_field query classes
  const leftover = totalBudget - spent;
  if (leftover > 0) {
    const baseSlots = Math.min(Math.ceil(leftover * 0.4), leftover);
    const learnedSlots = Math.min(Math.ceil(leftover * 0.3), leftover - baseSlots);
    const hardSlots = Math.max(0, leftover - baseSlots - learnedSlots);
    allocation.push({
      archetype: 'base_template',
      hosts: [],
      slots: baseSlots,
      coveredFields: []
    });
    allocation.push({
      archetype: 'learned',
      hosts: [],
      slots: learnedSlots,
      coveredFields: []
    });
    allocation.push({
      archetype: 'hard_field',
      hosts: [],
      slots: hardSlots,
      coveredFields: []
    });
  }

  return allocation;
}

// ── emitArchetypeQueries ──

export function emitArchetypeQueries(slot, identity, product, focusFields, options = {}) {
  const { archetype, hosts, slots, coveredFields } = slot;
  const { fieldYieldByDomain = null } = options;
  const brand = identity?.brand || '';
  const model = identity?.model || '';
  const productStr = product || `${brand} ${model}`.trim();
  const rows = [];
  const usedSiteHosts = new Set();

  if (slots <= 0) return rows;

  const targetFields = (coveredFields || []).filter((f) =>
    (focusFields || []).includes(f)
  );

  const familyForArchetype = archetypeFamily(archetype);

  if (archetype === 'manufacturer') {
    // WHY: Diverse intents per archetype. Host as soft bias unless zero-yield.
    // Zero-yield hosts (>= 3 attempts, 0 fields) lose bias — dedup collapses
    // the naked intent query, freeing a slot for the search engine to find better sources.
    const hostList = hosts || [];
    const intents = [
      { suffix: 'official specifications', family: 'spec', reason: 'manufacturer_spec', docHint: 'spec' },
      { suffix: 'user manual pdf', family: 'manual', reason: 'manufacturer_manual', docHint: 'manual_pdf' },
      { suffix: 'support', family: 'support', reason: 'manufacturer_support', docHint: 'support' }
    ];
    for (let i = 0; i < intents.length && rows.length < slots; i++) {
      const intent = intents[i];
      const host = hostList[Math.min(i, hostList.length - 1)] || '';
      const skipBias = isZeroYieldHost(host, fieldYieldByDomain);
      const query = (host && !skipBias)
        ? `${productStr} ${intent.suffix} ${host}`
        : `${productStr} ${intent.suffix}`;
      rows.push(makeRow({
        query,
        hintSource: 'archetype_planner',
        targetFields,
        docHint: intent.docHint,
        domainHint: skipBias ? '' : host,
        archetype,
        gapReason: intent.reason,
        queryFamily: intent.family,
        targetFieldsForFingerprint: targetFields
      }));
    }
  } else if (archetype === 'lab_review') {
    const hostList = hosts || [];
    const intents = [
      { suffix: 'review', family: 'review', reason: 'lab_measurements' },
      { suffix: 'review measurements', family: 'review', reason: 'lab_measurements' },
      { suffix: 'review teardown', family: 'review', reason: 'lab_teardown' }
    ];
    for (let i = 0; i < intents.length && rows.length < slots; i++) {
      const intent = intents[i];
      const host = hostList[Math.min(i, hostList.length - 1)] || '';
      const skipBias = isZeroYieldHost(host, fieldYieldByDomain);
      const query = (host && !skipBias)
        ? `${productStr} ${intent.suffix} ${host}`
        : `${productStr} ${intent.suffix}`;
      rows.push(makeRow({
        query,
        hintSource: 'archetype_planner',
        targetFields,
        docHint: 'review',
        domainHint: skipBias ? '' : host,
        archetype,
        gapReason: intent.reason,
        queryFamily: intent.family,
        targetFieldsForFingerprint: targetFields
      }));
    }
  } else if (archetype === 'spec_database') {
    const hostList = hosts || [];
    const intents = [
      { suffix: 'specifications', family: 'spec', reason: 'spec_database_lookup' },
      { suffix: 'dimensions weight', family: 'spec', reason: 'spec_database_dimensions' }
    ];
    for (let i = 0; i < intents.length && rows.length < slots; i++) {
      const intent = intents[i];
      const host = hostList[Math.min(i, hostList.length - 1)] || '';
      const skipBias = isZeroYieldHost(host, fieldYieldByDomain);
      const query = (host && !skipBias)
        ? `${productStr} ${intent.suffix} ${host}`
        : `${productStr} ${intent.suffix}`;
      rows.push(makeRow({
        query,
        hintSource: 'archetype_planner',
        targetFields,
        docHint: 'spec_database',
        domainHint: skipBias ? '' : host,
        archetype,
        gapReason: intent.reason,
        queryFamily: intent.family,
        targetFieldsForFingerprint: targetFields
      }));
    }
  } else if (archetype === 'retailer') {
    // WHY: Retailer hosts have low source-field fit — no host bias, plain product query
    for (const host of (hosts || [])) {
      if (rows.length >= slots) break;
      if (!usedSiteHosts.has(host)) {
        usedSiteHosts.add(host);
        rows.push(makeRow({
          query: `${productStr} specifications`,
          hintSource: 'archetype_planner',
          targetFields,
          docHint: 'product_page',
          domainHint: host,
          archetype,
          gapReason: 'retailer_page',
          queryFamily: 'product_page',
          targetFieldsForFingerprint: targetFields
        }));
      }
    }
  } else {
    // WHY: Generic/aggregator hosts — no host bias, plain product query
    for (const host of (hosts || [])) {
      if (rows.length >= slots) break;
      if (!usedSiteHosts.has(host)) {
        usedSiteHosts.add(host);
        rows.push(makeRow({
          query: `${productStr} specifications`,
          hintSource: 'archetype_planner',
          targetFields,
          docHint: '',
          domainHint: host,
          archetype,
          gapReason: `${archetype}_lookup`,
          queryFamily: familyForArchetype,
          targetFieldsForFingerprint: targetFields
        }));
      }
    }
  }

  return rows;
}

// ── classifyFieldSearchWorthiness ──

export function classifyFieldSearchWorthiness(field, fieldRule, archetypeCoverage) {
  if (NEVER_SEARCH_FIELDS.has(field)) return 'never';

  const requiredLevel = fieldRule?.required_level;
  const queryTerms = fieldRule?.search_hints?.query_terms || [];

  // Infer-first fields: coating, feet_material, etc.
  if (INFER_FIRST_FIELDS.has(field)) return 'infer_first';

  // Always: critical/required level OR known high-value fields
  if (requiredLevel === 'critical' || requiredLevel === 'required') return 'always';

  // Fields with no search_hints.query_terms and optional → never
  if (queryTerms.length === 0 && requiredLevel === 'optional') return 'never';

  // Fields with query_terms → at least conditional
  if (queryTerms.length > 0) return 'conditional';

  // Expected level without query terms → conditional
  if (requiredLevel === 'expected') return 'conditional';

  return 'never';
}

// ── identifyUncoveredFields ──

export function identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig) {
  const fieldRules = categoryConfig?.fieldRules?.fields || {};
  const searchWorthy = [];
  const inferFirst = [];

  for (const field of (focusFields || [])) {
    if (coveredFieldSet && coveredFieldSet.has(field)) continue;

    const rule = fieldRules[field] || {};
    const worthiness = classifyFieldSearchWorthiness(field, rule, coveredFieldSet);

    if (worthiness === 'infer_first') {
      inferFirst.push(field);
    } else if (worthiness === 'always' || worthiness === 'conditional') {
      searchWorthy.push(field);
    }
    // 'never' → excluded entirely
  }

  return { searchWorthy, inferFirst };
}

// ── emitHardFieldQueries ──

export function emitHardFieldQueries(uncoveredFields, identity, product, categoryConfig) {
  const fieldRules = categoryConfig?.fieldRules?.fields || {};
  const brand = identity?.brand || '';
  const model = identity?.model || '';
  const productStr = product || `${brand} ${model}`.trim();
  const rows = [];

  for (const field of (uncoveredFields || [])) {
    const rule = fieldRules[field] || {};
    const queryTerms = (rule?.search_hints?.query_terms || [])
      .map((t) => String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const primaryTerm = queryTerms[0] || field.replace(/_/g, ' ');

    rows.push(makeRow({
      query: `${productStr} ${primaryTerm}`,
      hintSource: 'archetype_planner',
      targetFields: [field],
      docHint: (rule?.search_hints?.preferred_content_types || [])[0] || 'spec',
      domainHint: '',
      archetype: 'hard_field',
      gapReason: `uncovered_${field}`,
      queryFamily: 'spec',
      targetFieldsForFingerprint: [field]
    }));
  }

  return rows;
}

// ── intentFingerprint ──

export function intentFingerprint(row) {
  const archetype = row?._meta?.archetype || '';
  const host = row?.domain_hint || '';
  const family = row?._meta?.query_family || '';
  const fields = [...(row?.target_fields || [])].sort();
  const cluster = fields.join(',');

  return `${archetype}:${host}:${family}:${cluster}`;
}

// ── buildArchetypeSummary ──

export function buildArchetypeSummary(allocatedSlots) {
  const summary = {};

  for (const slot of (allocatedSlots || [])) {
    const type = slot.archetype;
    if (!type) continue;

    summary[type] = {
      hosts: slot.hosts || [],
      queries_emitted: slot.slots || 0,
      coverage_hint_count: (slot.coveredFields || []).length
    };
  }

  return summary;
}

// ── buildCoverageAnalysis ──

export function buildCoverageAnalysis(focusFields, coveredFieldSet, hardFieldRows) {
  const total = (focusFields || []).length;
  const covered = coveredFieldSet ? coveredFieldSet.size : 0;
  const uncoveredSearchWorthy = (focusFields || []).filter((f) =>
    !coveredFieldSet?.has(f)
  );
  const inferFirst = uncoveredSearchWorthy.filter((f) => INFER_FIRST_FIELDS.has(f));
  const searchWorthy = uncoveredSearchWorthy.filter((f) => !INFER_FIRST_FIELDS.has(f));

  return {
    total_missing: total,
    covered_by_archetypes: covered,
    uncovered_search_worthy: searchWorthy,
    uncovered_infer_first: inferFirst,
    hard_field_queries_emitted: (hardFieldRows || []).length
  };
}

// ── Internal helpers ──

function extractHostFromUrl(url) {
  if (!url) return '';
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return '';
  }
}

// WHY: Skip domain bias for hosts that were tried >= 3 times in prior runs and yielded
// zero fields. New hosts (not in map) or hosts with < 3 attempts keep their bias —
// a single transient failure (timeout, CAPTCHA) shouldn't permanently banish a host.
export function isZeroYieldHost(host, fieldYieldByDomain) {
  if (!host || !fieldYieldByDomain) return false;
  const entry = fieldYieldByDomain[host];
  if (!entry) return false;
  const hasZeroFields = Object.keys(entry.fields || {}).length === 0;
  const hasSufficientAttempts = (entry.attempts || 0) >= 3;
  return hasZeroFields && hasSufficientAttempts;
}

function archetypeFamily(archetype) {
  const families = {
    manufacturer: 'spec',
    lab_review: 'review',
    spec_database: 'spec',
    aggregator: 'aggregator',
    retailer: 'product_page',
    community: 'discussion'
  };
  return families[archetype] || archetype;
}

function makeRow({ query, hintSource, targetFields, docHint, domainHint, archetype, gapReason, queryFamily, targetFieldsForFingerprint }) {
  const row = {
    query,
    hint_source: hintSource || 'archetype_planner',
    target_fields: targetFields || [],
    doc_hint: docHint || '',
    alias: '',
    domain_hint: domainHint || '',
    source_host: domainHint || '',
    _meta: {
      archetype: archetype || '',
      gap_reason: gapReason || '',
      intent_fingerprint: '',
      query_family: queryFamily || ''
    }
  };

  // Compute fingerprint
  row._meta.intent_fingerprint = intentFingerprint(row);

  return row;
}
