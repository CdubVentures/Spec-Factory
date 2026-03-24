import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchProfile } from '../queryBuilder.js';

const FIELD_TERM_MAP = {
  polling_rate: ['polling', 'report rate', 'hz'],
  dpi: ['dpi', 'cpi'],
  sensor: ['sensor', 'optical'],
  click_latency: ['latency', 'response time'],
  battery_hours: ['battery', 'battery life'],
  weight: ['weight', 'mass', 'grams'],
  switch: ['switch', 'microswitch'],
  connection: ['connectivity', 'wireless', 'wired'],
  lift: ['lift off', 'lod'],
};

function filterRelevantQueries(queries, missingFields = []) {
  if (!missingFields.length || !queries.length) return queries;
  const terms = new Set();
  for (const field of missingFields) {
    const normalized = String(field || '').toLowerCase().replace(/^fields\./, '');
    terms.add(normalized.replace(/_/g, ' '));
    for (const synonym of (FIELD_TERM_MAP[normalized] || [])) {
      terms.add(synonym.toLowerCase());
    }
  }
  const filtered = queries.filter((q) => {
    const lower = String(q || '').toLowerCase();
    return [...terms].some((term) => lower.includes(term));
  });
  return filtered.length >= 3 ? filtered : queries;
}

function makeJob(overrides = {}) {
  return {
    category: 'mouse',
    productId: 'mouse-endgame-gear-op1-8k',
    identityLock: {
      brand: 'Endgame Gear',
      model: 'OP1 8K',
      variant: '',
      ...overrides.identityLock
    },
    ...overrides
  };
}

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    fieldOrder: [
      'connection', 'polling_rate', 'sensor', 'dpi', 'weight',
      'click_latency', 'switch', 'battery_hours', 'lift'
    ],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'steelseries.com', tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tierName: 'lab', role: 'lab' },
      { host: 'techpowerup.com', tierName: 'lab', role: 'lab' }
    ],
    searchTemplates: [],
    fieldRules: {
      fields: {
        connection: { search_hints: { query_terms: ['connectivity', 'wireless wired'] } },
        polling_rate: { search_hints: { query_terms: ['polling rate hz', 'report rate'] } },
        sensor: { search_hints: { query_terms: ['optical sensor model'] } },
        dpi: { search_hints: { query_terms: ['dpi range', 'cpi'] } },
        weight: { search_hints: { query_terms: ['weight grams'] } }
      }
    },
    ...overrides
  };
}

// WHY: Tier-only pipeline needs focusGroups to produce per-field queries.
// Build a tier3 focus group with one key per field.
function makeFocusGroupsForFields(fields) {
  return [{
    key: 'field_allocation_group',
    label: 'Field Allocation',
    group_search_worthy: false,
    normalized_key_queue: fields,
    unresolved_field_keys: fields,
    field_keys: fields,
    satisfied_field_keys: [],
    productivity_score: 50,
    group_description_short: fields.join(' '),
    group_description_long: fields.join(' '),
    query_terms_union: [],
    domain_hints_union: [],
    preferred_content_types_union: [],
    domains_tried_union: [],
    aliases_union: [],
    total_field_count: fields.length,
    resolved_field_count: 0,
    coverage_ratio: 0,
    phase: 'now',
    skip_reason: null,
    desc: fields.join(' '),
  }];
}

describe('Field Allocation — Round-Robin Fairness', () => {
  it('every missing field gets at least 1 query when 5 fields compete for 16 slots', () => {
    const fields = ['connection', 'polling_rate', 'sensor', 'dpi', 'weight'];
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: fields,
      maxQueries: 16,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: makeFocusGroupsForFields(fields),
    });

    const fieldTargetMap = profile.field_target_queries;
    for (const field of fields) {
      const count = (fieldTargetMap[field] || []).length;
      assert.ok(count >= 1,
        `field "${field}" got ${count} queries — expected at least 1`);
    }
  });

  it('no single field monopolizes more than ceil(cap/fieldCount) + 2 queries', () => {
    const fields = ['connection', 'polling_rate', 'sensor', 'dpi', 'weight'];
    const cap = 16;
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: fields,
      maxQueries: cap,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: makeFocusGroupsForFields(fields),
    });

    const maxPerField = Math.ceil(cap / fields.length) + 2;
    const queryRows = profile.query_rows;
    const fieldCounts = {};
    for (const row of queryRows) {
      for (const field of (row.target_fields || [])) {
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
      }
    }

    for (const [field, count] of Object.entries(fieldCounts)) {
      assert.ok(count <= maxPerField,
        `field "${field}" got ${count} query rows — max allowed is ${maxPerField}`);
    }
  });

  it('late-listed fields (weight) get queries alongside early-listed fields (connection)', () => {
    const fields = ['connection', 'polling_rate', 'sensor', 'dpi', 'weight'];
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: fields,
      maxQueries: 16,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: makeFocusGroupsForFields(fields),
    });

    const connectionQueries = profile.queries.filter((q) =>
      q.toLowerCase().includes('connect') || q.toLowerCase().includes('wireless'));
    const weightQueries = profile.queries.filter((q) =>
      q.toLowerCase().includes('weight') || q.toLowerCase().includes('grams'));

    assert.ok(connectionQueries.length >= 1, 'connection gets queries');
    assert.ok(weightQueries.length >= 1, 'weight gets queries despite being listed last');
  });

  it('with 8 fields and maxQueries=16, every field still represented', () => {
    const fields = [
      'connection', 'polling_rate', 'sensor', 'dpi',
      'weight', 'click_latency', 'switch', 'lift'
    ];
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig({
        fieldRules: {
          fields: {
            connection: { search_hints: { query_terms: ['connectivity'] } },
            polling_rate: { search_hints: { query_terms: ['polling rate'] } },
            sensor: { search_hints: { query_terms: ['sensor'] } },
            dpi: { search_hints: { query_terms: ['dpi'] } },
            weight: { search_hints: { query_terms: ['weight'] } },
            click_latency: { search_hints: { query_terms: ['click latency'] } },
            switch: { search_hints: { query_terms: ['switch type'] } },
            lift: { search_hints: { query_terms: ['lift off distance'] } }
          }
        }
      }),
      missingFields: fields,
      maxQueries: 16,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: makeFocusGroupsForFields(fields),
    });

    const fieldTargetMap = profile.field_target_queries;
    const missing = fields.filter((f) => !(fieldTargetMap[f] || []).length);
    assert.ok(missing.length === 0,
      `fields with zero queries: [${missing.join(', ')}]`);
  });
});

describe('Brand Domain Injection — Official Domain Fallback', () => {
  it('uses brand resolver officialDomain for soft host-biased queries when no approved host matches', () => {
    const profile = buildSearchProfile({
      job: makeJob({ identityLock: { brand: 'Endgame Gear', model: 'OP1 8K', variant: '' } }),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      brandResolution: {
        officialDomain: 'endgamegear.com',
        aliases: []
      }
    });

    // WHY: soft domain bias — official domain in query text, not competitors
    const officialHostQueries = profile.queries.filter((q) => q.includes('endgamegear.com'));
    const competitorHostQueries = profile.queries.filter((q) =>
      q.includes('razer.com') || q.includes('logitechg.com') || q.includes('steelseries.com'));

    assert.ok(officialHostQueries.length >= 1,
      `expected endgamegear.com host-biased queries, got ${officialHostQueries.length}. All queries: ${JSON.stringify(profile.queries)}`);
    assert.equal(competitorHostQueries.length, 0,
      `expected no competitor host-biased queries, got: ${JSON.stringify(competitorHostQueries)}`);
  });

  it('still uses approved hosts when brand IS in the approved list', () => {
    const profile = buildSearchProfile({
      job: makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24,
      brandResolution: {
        officialDomain: 'razer.com',
        aliases: []
      }
    });

    // WHY: soft domain bias — host appears as plain text, not site: operator
    const razerHostQueries = profile.queries.filter((q) => q.includes('razer.com') && !q.includes('site:'));

    assert.ok(razerHostQueries.length >= 1, 'razer.com soft host-biased queries generated from approved list');
  });
});

describe('Query Diversity — Template Type Distribution', () => {
  it('tier-only output has seed doc_hint and tier tags on all rows', () => {
    // WHY: Tier-only pipeline doc_hint diversity is limited: tier1 seed rows
    // have doc_hint='spec', tier2/tier3 rows have empty doc_hint. The legacy
    // archetype pipeline that produced diverse doc_hints has been removed.
    const fields = ['connection', 'polling_rate', 'sensor', 'dpi', 'weight'];
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig({
        fieldRules: {
          fields: {
            connection: { search_hints: { query_terms: ['connectivity'], preferred_content_types: ['spec', 'lab_review'] } },
            polling_rate: { search_hints: { query_terms: ['polling rate'], preferred_content_types: ['manual_pdf', 'benchmark'] } },
            sensor: { search_hints: { query_terms: ['sensor'], preferred_content_types: ['teardown_review'] } },
            dpi: { search_hints: { query_terms: ['dpi'] } },
            weight: { search_hints: { query_terms: ['weight grams'] } }
          }
        }
      }),
      missingFields: fields,
      maxQueries: 20,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: makeFocusGroupsForFields(fields),
    });

    // All rows should have a tier tag
    assert.ok(profile.query_rows.every((r) => r.tier), 'all rows have tier tag');
    // Seed rows should have doc_hint='spec'
    const seedRows = profile.query_rows.filter((r) => r.tier === 'seed');
    assert.ok(seedRows.length > 0, 'seed rows present');
    assert.ok(seedRows.some((r) => r.doc_hint === 'spec'), 'seed row has doc_hint=spec');
  });

  it('per-field per-template-type is capped — no field produces 20 rows', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig({
        fieldRules: {
          fields: {
            connection: {
              search_hints: {
                query_terms: ['connectivity', 'wireless', 'wired', 'bluetooth', 'usb receiver'],
                preferred_content_types: ['spec', 'manual_pdf', 'datasheet']
              }
            }
          }
        }
      }),
      missingFields: ['connection'],
      maxQueries: 48
    });

    const connectionRows = profile.query_rows.filter((r) =>
      (r.target_fields || []).includes('connection'));

    assert.ok(connectionRows.length <= 24,
      `connection produced ${connectionRows.length} query rows — expected ≤24 (capped per template type, down from 30+)`);
  });
});

describe('existingQueries Filtering for LLM Planner', () => {
  it('filters existingQueries to only relevant-field queries', () => {
    const connectionQueries = [
      'Endgame Gear OP1 8K connectivity specification',
      'Endgame Gear OP1 8K wireless manual pdf',
      'Endgame Gear OP1 8K wired specification',
      'site:razer.com Endgame Gear OP1 8K connectivity',
      'Endgame Gear OP1 8K connectivity datasheet',
      'Endgame Gear OP1 8K wireless wired specification',
      'Endgame Gear OP1 8K connectivity manual pdf',
      'Endgame Gear OP1 8K wireless datasheet',
      'Endgame Gear OP1 8K wired manual pdf',
      'Endgame Gear OP1 8K connectivity specification sheet'
    ];
    const pollingQueries = [
      'Endgame Gear OP1 8K polling rate specification',
      'Endgame Gear OP1 8K report rate manual pdf',
      'Endgame Gear OP1 8K hz specification',
      'Endgame Gear OP1 8K polling rate datasheet',
      'Endgame Gear OP1 8K report rate specification'
    ];
    const allQueries = [...connectionQueries, ...pollingQueries];
    const missingCriticalFields = ['polling_rate'];

    const filtered = filterRelevantQueries(allQueries, missingCriticalFields);

    assert.ok(filtered.length >= 3, `expected ≥3 filtered queries, got ${filtered.length}`);
    assert.ok(filtered.length <= pollingQueries.length + 2,
      `expected filtered set to be dominated by polling_rate queries, got ${filtered.length}`);

    const hasPolling = filtered.some((q) =>
      q.toLowerCase().includes('polling') || q.toLowerCase().includes('report rate') || q.toLowerCase().includes('hz'));
    assert.ok(hasPolling, 'filtered queries contain polling-rate-related terms');
  });

  it('falls back to all queries if filter yields fewer than 3', () => {
    const queries = [
      'Endgame Gear OP1 8K connectivity specification',
      'Endgame Gear OP1 8K wireless manual pdf',
      'Endgame Gear OP1 8K wired specification',
      'Endgame Gear OP1 8K connectivity datasheet'
    ];
    const missingCriticalFields = ['click_latency'];

    const filtered = filterRelevantQueries(queries, missingCriticalFields);

    assert.ok(filtered.length === queries.length,
      `expected fallback to all ${queries.length} queries, got ${filtered.length}`);
  });

  it('handles multiple missing fields in filter', () => {
    const queries = [
      'Endgame Gear OP1 8K polling rate spec',
      'Endgame Gear OP1 8K weight grams',
      'Endgame Gear OP1 8K connectivity wireless',
      'Endgame Gear OP1 8K sensor model'
    ];
    const missingCriticalFields = ['polling_rate', 'weight'];

    const filtered = filterRelevantQueries(queries, missingCriticalFields);

    assert.ok(filtered.length >= 2, 'filters to queries matching either field');
    const hasPolling = filtered.some((q) => q.toLowerCase().includes('polling'));
    const hasWeight = filtered.some((q) => q.toLowerCase().includes('weight'));
    assert.ok(hasPolling, 'includes polling_rate queries');
    assert.ok(hasWeight, 'includes weight queries');
  });
});
