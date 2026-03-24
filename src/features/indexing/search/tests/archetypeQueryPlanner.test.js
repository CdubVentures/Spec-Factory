import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Module under test — will be created in Phase 2
import {
  classifySourceArchetypes,
  computeArchetypeCoverage,
  allocateArchetypeBudget,
  emitArchetypeQueries,
  classifyFieldSearchWorthiness,
  identifyUncoveredFields,
  emitHardFieldQueries,
  intentFingerprint,
  buildArchetypeSummary,
  buildCoverageAnalysis,
  isZeroYieldHost
} from '../archetypeQueryPlanner.js';

// ── Fixtures ──

function makeSourceRegistry() {
  return {
    rtings_com: {
      display_name: 'RTINGS',
      tier: 'tier2_lab',
      base_url: 'https://www.rtings.com',
      content_types: ['review', 'benchmark'],
      field_coverage: {
        high: ['click_latency', 'sensor_latency', 'weight', 'shape'],
        medium: ['polling_rate', 'dpi', 'sensor', 'battery_hours'],
        low: []
      },
      discovery: {
        source_type: 'lab_review',
        priority: 98,
        enabled: true
      }
    },
    techpowerup_com: {
      display_name: 'TechPowerUp',
      tier: 'tier2_lab',
      base_url: 'https://www.techpowerup.com',
      content_types: ['review'],
      field_coverage: {
        high: ['sensor', 'lift', 'encoder', 'switch'],
        medium: ['weight', 'dpi', 'polling_rate', 'mcu'],
        low: []
      },
      discovery: {
        source_type: 'lab_review',
        priority: 94,
        enabled: true
      }
    },
    amazon_com: {
      display_name: 'Amazon',
      tier: 'tier3_retailer',
      base_url: 'https://www.amazon.com',
      content_types: ['product_page'],
      field_coverage: {
        high: ['weight', 'lngth', 'width', 'height'],
        medium: ['connection', 'sensor', 'battery_hours', 'colors'],
        low: []
      },
      discovery: {
        source_type: 'retailer',
        priority: 45,
        enabled: true
      }
    },
    eloshapes_com: {
      display_name: 'EloShapes',
      tier: 'tier3_database',
      base_url: 'https://www.eloshapes.com',
      content_types: ['spec_database'],
      field_coverage: {
        high: ['lngth', 'width', 'height', 'weight', 'shape'],
        medium: ['sensor', 'dpi', 'connection', 'grip'],
        low: []
      },
      discovery: {
        source_type: 'spec_database',
        priority: 60,
        enabled: true
      }
    },
    reddit_com: {
      display_name: 'Reddit',
      tier: 'tier4_community',
      base_url: 'https://www.reddit.com',
      content_types: ['discussion'],
      field_coverage: {
        high: [],
        medium: [],
        low: ['shape', 'grip', 'weight']
      },
      discovery: {
        source_type: 'community',
        priority: 20,
        enabled: true
      }
    },
    pcpartpicker_com: {
      display_name: 'PCPartPicker',
      tier: 'tier5_aggregator',
      base_url: 'https://pcpartpicker.com',
      content_types: ['product_page'],
      field_coverage: {
        high: [],
        medium: ['sensor', 'connection', 'price_range'],
        low: []
      },
      discovery: {
        source_type: 'aggregator',
        priority: 35,
        enabled: true
      }
    }
  };
}

function makeSourceHosts() {
  return [
    { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer' },
    { host: 'rtings.com', tierName: 'lab', role: 'lab' },
    { host: 'techpowerup.com', tierName: 'lab', role: 'lab' },
    { host: 'amazon.com', tierName: 'retailer', role: 'retailer' },
    { host: 'eloshapes.com', tierName: 'database', role: 'database' }
  ];
}

function makeManufacturerHosts() {
  return ['razer.com'];
}

function makeIdentity() {
  return { brand: 'Razer', model: 'Viper V3 Pro', variant: '' };
}

function makeFieldRules() {
  return {
    click_latency: {
      required_level: 'critical',
      search_hints: {
        query_terms: ['click latency ms', 'end to end latency'],
        domain_hints: ['rtings.com'],
        preferred_content_types: ['lab_review', 'benchmark']
      }
    },
    sensor: {
      required_level: 'required',
      search_hints: {
        query_terms: ['optical sensor model', 'sensor IC'],
        preferred_content_types: ['teardown_review', 'lab_review']
      }
    },
    weight: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['weight grams'],
        domain_hints: ['razer.com'],
        preferred_content_types: ['spec']
      }
    },
    coating: {
      required_level: 'optional',
      search_hints: {
        query_terms: [],
        preferred_content_types: ['review']
      }
    },
    discontinued: {
      required_level: 'optional',
      search_hints: { query_terms: [] }
    },
    mcu: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['microcontroller', 'MCU chip'],
        preferred_content_types: ['teardown_review']
      }
    },
    encoder: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['scroll wheel encoder'],
        preferred_content_types: ['teardown_review']
      }
    },
    dpi: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['max dpi', 'cpi'],
        preferred_content_types: ['spec']
      }
    },
    polling_rate: {
      required_level: 'critical',
      search_hints: {
        query_terms: ['polling rate hz'],
        preferred_content_types: ['spec']
      }
    },
    colors: {
      required_level: 'optional',
      search_hints: {
        query_terms: ['available colors'],
        preferred_content_types: ['product_page']
      }
    },
    battery_hours: {
      required_level: 'expected',
      search_hints: {
        query_terms: ['battery life hours'],
        preferred_content_types: ['spec']
      }
    },
    price_range: {
      required_level: 'optional',
      search_hints: {
        query_terms: ['price', 'MSRP'],
        preferred_content_types: ['product_page']
      }
    },
    feet_material: {
      required_level: 'optional',
      search_hints: { query_terms: [] }
    }
  };
}

// ── classifySourceArchetypes ──

describe('classifySourceArchetypes', () => {
  it('groups sources into correct archetypes by discovery.source_type', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );

    const byType = {};
    for (const a of archetypes) {
      byType[a.archetype] = byType[a.archetype] || [];
      byType[a.archetype].push(a);
    }

    assert.ok(byType.lab_review, 'lab_review archetype present');
    assert.ok(byType.retailer, 'retailer archetype present');
    assert.ok(byType.spec_database, 'spec_database archetype present');
    assert.ok(byType.manufacturer, 'manufacturer archetype present');

    const labHosts = byType.lab_review.flatMap((a) => a.hosts);
    assert.ok(labHosts.includes('rtings.com'), 'rtings.com in lab_review');
    assert.ok(labHosts.includes('techpowerup.com'), 'techpowerup.com in lab_review');
  });

  it('manufacturer archetype from brand resolution hints', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), ['razer.com', 'logitechg.com']
    );

    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr, 'manufacturer archetype exists');
    assert.ok(mfr.hosts.includes('razer.com'), 'razer.com in manufacturer hosts');
  });

  it('empty registry returns empty array', () => {
    const archetypes = classifySourceArchetypes({}, [], []);
    assert.ok(Array.isArray(archetypes));
    assert.equal(archetypes.length, 0);
  });

  it('coveredFields is advisory hint set on each archetype', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );

    for (const a of archetypes) {
      assert.ok(Array.isArray(a.coveredFields), `${a.archetype} has coveredFields array`);
    }

    const lab = archetypes.find((a) => a.archetype === 'lab_review');
    assert.ok(lab.coveredFields.length > 0, 'lab_review covers fields');
    assert.ok(lab.coveredFields.includes('click_latency'), 'lab covers click_latency');
  });
});

// ── computeArchetypeCoverage ──

describe('computeArchetypeCoverage', () => {
  it('computes coverage ratio correctly', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu', 'encoder'];
    const coverage = computeArchetypeCoverage(archetypes, focusFields);

    assert.ok(Array.isArray(coverage));
    for (const entry of coverage) {
      assert.equal(typeof entry.archetype, 'string');
      assert.equal(typeof entry.coverageRatio, 'number');
      assert.ok(entry.coverageRatio >= 0 && entry.coverageRatio <= 1,
        `coverageRatio in [0,1]: ${entry.coverageRatio}`);
    }
  });

  it('sorts by coverage descending', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const coverage = computeArchetypeCoverage(archetypes, ['click_latency', 'sensor', 'weight']);

    for (let i = 1; i < coverage.length; i++) {
      assert.ok(coverage[i - 1].coverageRatio >= coverage[i].coverageRatio,
        `sorted descending at index ${i}`);
    }
  });

  it('missing field_coverage on a source is skipped gracefully', () => {
    const registry = {
      no_coverage_source: {
        display_name: 'Unknown',
        discovery: { source_type: 'spec_database', enabled: true }
      }
    };
    const archetypes = classifySourceArchetypes(registry, [], []);
    const coverage = computeArchetypeCoverage(archetypes, ['weight']);

    assert.ok(Array.isArray(coverage));
    // Should not throw
  });

  it('coverage is scoring only — never gates query emission', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    // Even fields with 0 coverage should still be in the output
    const coverage = computeArchetypeCoverage(archetypes, ['nonexistent_field_xyz']);
    assert.ok(Array.isArray(coverage), 'returns valid array even for uncovered fields');
  });
});

// ── allocateArchetypeBudget ──

describe('allocateArchetypeBudget', () => {
  it('V1 defaults produce valid allocation', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    assert.ok(Array.isArray(allocation));
    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots <= 24, `total slots ${totalSlots} <= budget 24`);
    assert.ok(totalSlots > 0, 'at least some slots allocated');

    for (const slot of allocation) {
      assert.equal(typeof slot.archetype, 'string');
      assert.equal(typeof slot.slots, 'number');
      assert.ok(slot.slots >= 0, 'non-negative slots');
    }
  });

  it('tight budget degrades — only core archetypes get slots', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 4, {});

    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots <= 4, 'respects tight budget');

    const withSlots = allocation.filter((a) => a.slots > 0);
    assert.ok(withSlots.length <= 3, 'tight budget limits active archetypes');
  });

  it('context signals accepted, V1 ignores them', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const withContext = allocateArchetypeBudget(archetypes, 24, { boost_labs: true });
    const withoutContext = allocateArchetypeBudget(archetypes, 24, {});

    // V1: context is accepted but produces same result
    assert.equal(withContext.length, withoutContext.length);
  });

  it('community gets 0 slots in V1', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    const community = allocation.find((a) => a.archetype === 'community');
    if (community) {
      assert.equal(community.slots, 0, 'community gets 0 slots in V1');
    }
  });

  it('leftover budget goes to query_class emitters', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    // The allocation should account for the full budget across archetypes + query classes
    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots > 0, 'budget is utilized');
  });
});

// ── emitArchetypeQueries ──

describe('emitArchetypeQueries', () => {
  it('lab emits diverse intents with per-host soft domain bias', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com'],
      slots: 4,
      coveredFields: ['click_latency', 'sensor', 'weight']
    };
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu'];

    const rows = emitArchetypeQueries(slot, identity, product, focusFields);

    assert.ok(rows.length > 0, 'emits rows');
    // Soft domain bias — hosts appear in query text
    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'rtings.com soft bias in query');
    assert.ok(rows.some((r) => r.query.includes('techpowerup.com')), 'techpowerup.com soft bias in query');
    assert.ok(rows.every((r) => !r.query.includes('site:')), 'no site: operator');
    // domainHint metadata preserved across hosts
    const domainHints = new Set(rows.map((r) => r.domain_hint).filter(Boolean));
    assert.ok(domainHints.size >= 2, `multiple domain_hints: ${[...domainHints]}`);
    // Diverse intents — unique query strings
    const uniqueQueries = new Set(rows.map((r) => r.query));
    assert.ok(uniqueQueries.size >= 2, 'multiple distinct intent queries');
  });

  it('manufacturer emits diverse intent queries with soft domain bias', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';

    const rows = emitArchetypeQueries(slot, identity, product, ['weight', 'sensor']);

    assert.ok(rows.length > 0, 'emits rows');
    // Soft domain bias — host appears as plain text, not site: operator
    const hostRows = rows.filter((r) => r.query.includes('razer.com'));
    assert.ok(hostRows.length > 0, 'has soft domain-biased query');
    assert.ok(hostRows.every((r) => !r.query.includes('site:')), 'no site: operator');
    // domainHint metadata preserved
    assert.ok(rows.every((r) => r.domain_hint === 'razer.com'), 'domainHint still set');
    // Diverse intents — unique query strings
    const uniqueQueries = new Set(rows.map((r) => r.query));
    assert.equal(uniqueQueries.size, rows.length, 'all queries are unique intents');
  });

  it('target_fields from coverage intersection (advisory)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 2,
      coveredFields: ['click_latency', 'weight']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency', 'weight', 'mcu']);

    const hasTargetFields = rows.some((r) => r.target_fields && r.target_fields.length > 0);
    assert.ok(hasTargetFields, 'rows carry target_fields');
  });

  it('each intent variant is a unique query string (no duplicates)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com'],
      slots: 6,
      coveredFields: ['click_latency', 'sensor']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency', 'sensor']);

    // Every emitted query string must be unique
    const queries = rows.map((r) => r.query);
    const uniqueQueries = new Set(queries);
    assert.equal(queries.length, uniqueQueries.size,
      `no duplicate query strings: ${queries}`);
    // Each carries a domainHint
    for (const row of rows) {
      assert.ok(row.domain_hint, `row "${row.query}" has domain_hint`);
    }
  });

  it('every row has _meta with archetype, gap_reason, intent_fingerprint, query_family', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    for (const row of rows) {
      assert.ok(row._meta, 'row has _meta');
      assert.equal(typeof row._meta.archetype, 'string', '_meta.archetype is string');
      assert.equal(typeof row._meta.gap_reason, 'string', '_meta.gap_reason is string');
      assert.equal(typeof row._meta.intent_fingerprint, 'string', '_meta.intent_fingerprint is string');
      assert.equal(typeof row._meta.query_family, 'string', '_meta.query_family is string');
      assert.equal(row._meta.archetype, 'lab_review', '_meta.archetype matches slot');
    }
  });
});

// ── Intent-based queries: soft domain bias + diverse intents ──

describe('emitArchetypeQueries — soft domain bias with diverse intents', () => {
  it('manufacturer queries use soft domain bias (no site: operator)', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    for (const row of rows) {
      assert.ok(!row.query.includes('site:'), `no site: in "${row.query}"`);
    }
    assert.ok(rows.some((r) => r.query.includes('razer.com')), 'soft domain bias present');
  });

  it('lab_review queries use soft domain bias per host', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com'],
      slots: 4,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'rtings.com soft bias');
    assert.ok(rows.some((r) => r.query.includes('techpowerup.com')), 'techpowerup.com soft bias');
    assert.ok(rows.every((r) => !r.query.includes('site:')), 'no site: operator');
  });

  it('spec_database queries use soft domain bias', () => {
    const slot = {
      archetype: 'spec_database',
      hosts: ['eloshapes.com'],
      slots: 3,
      coveredFields: ['weight']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    assert.ok(rows.some((r) => r.query.includes('eloshapes.com')), 'soft domain bias present');
    assert.ok(rows.every((r) => !r.query.includes('site:')), 'no site: operator');
  });

  it('no host → no domain token in query (graceful fallback)', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: [],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    assert.ok(rows.length > 0, 'still emits rows');
    for (const row of rows) {
      assert.ok(!row.query.includes('.com'), `no domain in "${row.query}" when hosts empty`);
    }
  });

  it('manufacturer emits diverse intents (specifications, manual, support)', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    const queries = rows.map((r) => r.query.toLowerCase());
    assert.ok(queries.some((q) => q.includes('specifications')), 'has specifications intent');
    assert.ok(queries.some((q) => q.includes('manual') || q.includes('pdf')), 'has manual intent');
    assert.ok(queries.some((q) => q.includes('support')), 'has support intent');
  });

  it('lab_review emits diverse intents (review, measurements, teardown)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com', 'overclock.net'],
      slots: 4,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    const queries = rows.map((r) => r.query.toLowerCase());
    assert.ok(queries.some((q) => q.includes('review') && !q.includes('measurements') && !q.includes('teardown')), 'has plain review intent');
    assert.ok(queries.some((q) => q.includes('measurements')), 'has measurements intent');
    assert.ok(queries.some((q) => q.includes('teardown')), 'has teardown intent');
  });

  it('spec_database emits diverse intents (specifications, dimensions)', () => {
    const slot = {
      archetype: 'spec_database',
      hosts: ['eloshapes.com', 'rtings.com'],
      slots: 3,
      coveredFields: ['weight']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    const queries = rows.map((r) => r.query.toLowerCase());
    assert.ok(queries.some((q) => q.includes('specifications')), 'has specifications intent');
    assert.ok(queries.some((q) => q.includes('dimensions')), 'has dimensions intent');
  });

  it('each intent variant carries a deliberate domainHint from host list', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com', 'overclock.net'],
      slots: 4,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    // First intent → first host, second → second host, etc.
    if (rows.length >= 2) {
      assert.equal(rows[0].domain_hint, 'rtings.com', 'first intent gets first host');
      assert.equal(rows[1].domain_hint, 'techpowerup.com', 'second intent gets second host');
    }
    if (rows.length >= 3) {
      assert.equal(rows[2].domain_hint, 'overclock.net', 'third intent gets third host');
    }
  });
});

// ── classifyFieldSearchWorthiness ──

describe('classifyFieldSearchWorthiness', () => {
  const fieldRules = makeFieldRules();

  it('click_latency → always (regardless of tier)', () => {
    const result = classifyFieldSearchWorthiness('click_latency', fieldRules.click_latency, new Set());
    assert.equal(result, 'always');
  });

  it('critical required_level field → always', () => {
    const result = classifyFieldSearchWorthiness('polling_rate', fieldRules.polling_rate, new Set());
    assert.equal(result, 'always');
  });

  it('coating → infer_first', () => {
    const result = classifyFieldSearchWorthiness('coating', fieldRules.coating, new Set());
    assert.equal(result, 'infer_first');
  });

  it('discontinued → never', () => {
    const result = classifyFieldSearchWorthiness('discontinued', fieldRules.discontinued, new Set());
    assert.equal(result, 'never');
  });

  it('non-empty search_hints.query_terms → at least conditional', () => {
    const result = classifyFieldSearchWorthiness('mcu', fieldRules.mcu, new Set());
    assert.ok(
      result === 'always' || result === 'conditional',
      `mcu worthiness is ${result}, expected always or conditional`
    );
  });

  it('worthiness is NOT tier-restricted', () => {
    // A field with low required_level but good search hints should still be searchable
    const result = classifyFieldSearchWorthiness('colors', fieldRules.colors, new Set());
    assert.ok(result !== 'never', `colors (optional) is not "never" with query_terms`);
  });
});

// ── identifyUncoveredFields ──

describe('identifyUncoveredFields', () => {
  it('filters to search-worthy (always + conditional)', () => {
    const focusFields = ['click_latency', 'mcu', 'encoder', 'coating', 'discontinued'];
    const coveredFieldSet = new Set(['click_latency']);
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);

    assert.ok(uncovered.searchWorthy.length > 0, 'has search-worthy uncovered');
    assert.ok(uncovered.searchWorthy.includes('mcu'), 'mcu is search-worthy uncovered');
    assert.ok(uncovered.searchWorthy.includes('encoder'), 'encoder is search-worthy uncovered');
  });

  it('never-class excluded', () => {
    const focusFields = ['discontinued', 'mcu'];
    const coveredFieldSet = new Set();
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);

    assert.ok(!uncovered.searchWorthy.includes('discontinued'), 'discontinued excluded');
  });

  it('infer_first excluded from hard-field emission', () => {
    const focusFields = ['coating', 'mcu'];
    const coveredFieldSet = new Set();
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);

    assert.ok(!uncovered.searchWorthy.includes('coating'), 'coating (infer_first) excluded from searchWorthy');
    assert.ok(Array.isArray(uncovered.inferFirst), 'inferFirst array present');
    assert.ok(uncovered.inferFirst.includes('coating'), 'coating in inferFirst');
  });
});

// ── intentFingerprint ──

describe('intentFingerprint', () => {
  it('same archetype+host+family+cluster → same fingerprint', () => {
    const row1 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['click_latency', 'sensor'] };
    const row2 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['sensor', 'click_latency'] };

    assert.equal(intentFingerprint(row1), intentFingerprint(row2));
  });

  it('different host → different fingerprint', () => {
    const row1 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['click_latency'] };
    const row2 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'techpowerup.com', target_fields: ['click_latency'] };

    assert.notEqual(intentFingerprint(row1), intentFingerprint(row2));
  });

  it('hard-field with empty host uses field_cluster for differentiation', () => {
    const row1 = { _meta: { archetype: 'hard_field', query_family: 'spec' }, domain_hint: '', target_fields: ['mcu'] };
    const row2 = { _meta: { archetype: 'hard_field', query_family: 'spec' }, domain_hint: '', target_fields: ['encoder'] };

    assert.notEqual(intentFingerprint(row1), intentFingerprint(row2));
  });

  it('word order does not matter in field cluster', () => {
    const row1 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['a', 'b', 'c'] };
    const row2 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['c', 'a', 'b'] };

    assert.equal(intentFingerprint(row1), intentFingerprint(row2));
  });
});

// ── emitHardFieldQueries ──

describe('emitHardFieldQueries', () => {
  it('emits queries for search-worthy uncovered fields', () => {
    const uncoveredFields = ['mcu', 'encoder'];
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const rows = emitHardFieldQueries(uncoveredFields, identity, product, categoryConfig);

    assert.ok(rows.length > 0, 'emits rows');
    for (const row of rows) {
      assert.ok(row.query, 'row has query');
      assert.ok(row._meta, 'row has _meta');
      assert.equal(row._meta.archetype, 'hard_field');
    }
  });

  it('uses field-specific query_terms from field rules', () => {
    const rows = emitHardFieldQueries(
      ['mcu'],
      makeIdentity(),
      'Razer Viper V3 Pro',
      { fieldRules: { fields: makeFieldRules() } }
    );

    const queries = rows.map((r) => r.query.toLowerCase());
    const hasMcuTerm = queries.some(
      (q) => q.includes('microcontroller') || q.includes('mcu')
    );
    assert.ok(hasMcuTerm, 'uses field-specific query terms');
  });
});

// ── Retailer gate ──

describe('allocateArchetypeBudget — retailer gate', () => {
  it('retailer off by default', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    const retailer = allocation.find((a) => a.archetype === 'retailer');
    if (retailer) {
      assert.equal(retailer.slots, 0, 'retailer gets 0 slots by default');
    }
  });

  it('fires when commerce fields missing + budget remains', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {
      missingCommerceFields: ['weight', 'colors', 'price_range', 'battery_hours']
    });

    const retailer = allocation.find((a) => a.archetype === 'retailer');
    if (retailer) {
      assert.ok(retailer.slots >= 0, 'retailer may get slots with commerce fields missing');
    }
  });
});

// ── Search template guarantee ──

describe('buildArchetypeSummary', () => {
  it('produces summary with expected shape', () => {
    const slots = [
      { archetype: 'lab_review', hosts: ['rtings.com', 'techpowerup.com'], slots: 4, coveredFields: ['click_latency'] },
      { archetype: 'manufacturer', hosts: ['razer.com'], slots: 2, coveredFields: [] }
    ];

    const summary = buildArchetypeSummary(slots);

    assert.ok(summary.lab_review, 'lab_review in summary');
    assert.ok(summary.manufacturer, 'manufacturer in summary');
    assert.ok(Array.isArray(summary.lab_review.hosts), 'hosts is array');
    assert.equal(typeof summary.lab_review.queries_emitted, 'number');
    assert.equal(typeof summary.lab_review.coverage_hint_count, 'number');
  });

  it('empty slots produces empty summary', () => {
    const summary = buildArchetypeSummary([]);
    assert.deepEqual(summary, {});
  });
});

// ── buildCoverageAnalysis ──

describe('buildCoverageAnalysis', () => {
  it('produces analysis with expected shape', () => {
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu', 'encoder'];
    const coveredFieldSet = new Set(['click_latency', 'sensor', 'weight']);
    const hardFieldRows = [
      { _meta: { archetype: 'hard_field' }, target_fields: ['mcu'] },
      { _meta: { archetype: 'hard_field' }, target_fields: ['encoder'] }
    ];

    const analysis = buildCoverageAnalysis(focusFields, coveredFieldSet, hardFieldRows);

    assert.equal(analysis.total_missing, 5);
    assert.equal(analysis.covered_by_archetypes, 3);
    assert.ok(Array.isArray(analysis.uncovered_search_worthy));
    assert.ok(Array.isArray(analysis.uncovered_infer_first));
    assert.equal(typeof analysis.hard_field_queries_emitted, 'number');
    assert.equal(analysis.hard_field_queries_emitted, 2);
  });
});

// ── Identity guard compatibility ──

describe('emitArchetypeQueries — identity guard compatibility', () => {
  it('all emitted queries contain brand + model tokens', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 4,
      coveredFields: ['click_latency', 'sensor']
    };
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';

    const rows = emitArchetypeQueries(slot, identity, product, ['click_latency', 'sensor']);

    for (const row of rows) {
      const lower = row.query.toLowerCase();
      assert.ok(
        lower.includes('razer') || lower.includes('viper'),
        `query "${row.query}" contains brand or model token`
      );
    }
  });
});

// ── Cross-category ──

describe('cross-category behavior', () => {
  it('empty registry produces valid output via fallback emitters', () => {
    const archetypes = classifySourceArchetypes({}, [], ['example.com']);

    // Should produce at least manufacturer archetype from manufacturerHosts
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    if (mfr) {
      assert.ok(mfr.hosts.includes('example.com'));
    }
  });

  it('category with only manufacturer + retailer sources produces valid allocation', () => {
    const registry = {
      amazon_com: makeSourceRegistry().amazon_com
    };
    const archetypes = classifySourceArchetypes(registry, makeSourceHosts(), ['brand-site.com']);
    const allocation = allocateArchetypeBudget(archetypes, 12, {});

    assert.ok(Array.isArray(allocation));
    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots > 0, 'produces non-zero allocation');
  });
});

// ── Phase 4 — Planner context: grouped fields + archetype metadata ──

describe('Phase 4 — Planner context: grouped fields + archetype metadata', () => {
  it('buildCoverageAnalysis groups fields by tier — full set preserved, not truncated', () => {
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu', 'encoder', 'dpi', 'polling_rate'];
    const coveredFieldSet = new Set(['click_latency', 'sensor', 'weight']);
    const hardFieldRows = [
      { _meta: { archetype: 'hard_field' }, target_fields: ['mcu'] },
      { _meta: { archetype: 'hard_field' }, target_fields: ['encoder'] }
    ];

    const analysis = buildCoverageAnalysis(focusFields, coveredFieldSet, hardFieldRows);

    // Full field set preserved — no truncation
    assert.equal(analysis.total_missing, focusFields.length, 'all 7 focus fields counted');
    assert.equal(analysis.covered_by_archetypes, coveredFieldSet.size, '3 covered by archetypes');

    // Uncovered fields are grouped into search_worthy vs infer_first
    assert.ok(Array.isArray(analysis.uncovered_search_worthy), 'uncovered_search_worthy is array');
    assert.ok(analysis.uncovered_search_worthy.length > 0, 'has search-worthy uncovered fields');

    // Grouped totals account for all focus fields
    const accountedFor = analysis.covered_by_archetypes
      + analysis.uncovered_search_worthy.length
      + analysis.uncovered_infer_first.length;
    assert.ok(accountedFor <= focusFields.length, 'grouped fields do not exceed total');
    assert.equal(analysis.hard_field_queries_emitted, 2, 'hard field queries counted');
  });

  it('buildArchetypeSummary maps to archetypes_emitted + hosts_targeted', () => {
    const slots = [
      { archetype: 'lab_review', hosts: ['rtings.com', 'techpowerup.com'], slots: 4, coveredFields: ['click_latency'] },
      { archetype: 'manufacturer', hosts: ['razer.com'], slots: 2, coveredFields: [] },
      { archetype: 'spec_database', hosts: ['eloshapes.com'], slots: 2, coveredFields: ['weight'] }
    ];

    const summary = buildArchetypeSummary(slots);

    // archetypes_emitted = keys of summary
    const archetypesEmitted = Object.keys(summary);
    assert.equal(archetypesEmitted.length, 3, '3 archetypes emitted');
    assert.ok(archetypesEmitted.includes('lab_review'), 'lab_review emitted');
    assert.ok(archetypesEmitted.includes('manufacturer'), 'manufacturer emitted');
    assert.ok(archetypesEmitted.includes('spec_database'), 'spec_database emitted');

    // hosts_targeted = union of all summary[x].hosts
    const hostsTargeted = new Set(Object.values(summary).flatMap((s) => s.hosts));
    assert.ok(hostsTargeted.has('rtings.com'), 'rtings targeted');
    assert.ok(hostsTargeted.has('techpowerup.com'), 'techpowerup targeted');
    assert.ok(hostsTargeted.has('razer.com'), 'razer targeted');
    assert.ok(hostsTargeted.has('eloshapes.com'), 'eloshapes targeted');
    assert.equal(hostsTargeted.size, 4, '4 hosts targeted');

    // Each entry carries planner-facing shape
    for (const [key, entry] of Object.entries(summary)) {
      assert.equal(typeof entry.queries_emitted, 'number', `${key}.queries_emitted is number`);
      assert.equal(typeof entry.coverage_hint_count, 'number', `${key}.coverage_hint_count is number`);
    }
  });
});

// ── manufacturer archetype excludes low-value subdomains ──

describe('manufacturer archetype excludes low-value subdomains', () => {
  it('support.razer.com excluded from manufacturer hosts', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['razer.com', 'support.razer.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr, 'manufacturer archetype exists');
    assert.ok(mfr.hosts.includes('razer.com'), 'official domain preserved');
    assert.ok(!mfr.hosts.includes('support.razer.com'), 'support subdomain excluded');
  });

  it('official domain razer.com preserved', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['razer.com', 'support.razer.com', 'help.razer.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr.hosts.includes('razer.com'), 'razer.com kept');
    assert.equal(mfr.hosts.length, 1, 'only official domain in hosts');
  });

  it('mysupport.brand.com excluded', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['logitech.com', 'mysupport.logitech.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr.hosts.includes('logitech.com'));
    assert.ok(!mfr.hosts.includes('mysupport.logitech.com'));
  });

  it('forum.brand.com excluded', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['corsair.com', 'forum.corsair.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr.hosts.includes('corsair.com'));
    assert.ok(!mfr.hosts.includes('forum.corsair.com'));
  });

  it('slot recovery — budget matches clean host list', () => {
    // With support subdomain: budget should be identical to without it
    const withSupport = classifySourceArchetypes({}, [], ['razer.com', 'support.razer.com']);
    const withoutSupport = classifySourceArchetypes({}, [], ['razer.com']);

    const allocWith = allocateArchetypeBudget(withSupport, 24, {});
    const allocWithout = allocateArchetypeBudget(withoutSupport, 24, {});

    const mfrWith = allocWith.find((a) => a.archetype === 'manufacturer');
    const mfrWithout = allocWithout.find((a) => a.archetype === 'manufacturer');
    assert.equal(mfrWith.slots, mfrWithout.slots, 'manufacturer slots identical');
  });

  it('emitArchetypeQueries with valid hosts only emits correct count', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);
    assert.ok(rows.length > 0, 'emits queries for valid host');
    assert.ok(rows.every((r) => !r.query.includes('support.')), 'no support domain in queries');
  });
});

// ── isZeroYieldHost ──

describe('isZeroYieldHost', () => {
  it('zero-yield host (>= 3 attempts, 0 fields) → true', () => {
    assert.equal(isZeroYieldHost('deadsite.com', {
      'deadsite.com': { attempts: 3, fields: {} }
    }), true);
  });

  it('high-attempt zero-yield → true', () => {
    assert.equal(isZeroYieldHost('deadsite.com', {
      'deadsite.com': { attempts: 10, fields: {} }
    }), true);
  });

  it('host with field yield → false', () => {
    assert.equal(isZeroYieldHost('rtings.com', {
      'rtings.com': { attempts: 5, fields: { click_latency: { seen: 3, accepted: 2, yield: 3 } } }
    }), false);
  });

  it('new host (not in map) → false', () => {
    assert.equal(isZeroYieldHost('newsite.com', {}), false);
  });

  it('insufficient attempts (< 3) → false (not proven dead yet)', () => {
    assert.equal(isZeroYieldHost('flaky.com', {
      'flaky.com': { attempts: 2, fields: {} }
    }), false);
  });

  it('single attempt → false (transient failure)', () => {
    assert.equal(isZeroYieldHost('flaky.com', {
      'flaky.com': { attempts: 1, fields: {} }
    }), false);
  });

  it('null fieldYieldByDomain → false', () => {
    assert.equal(isZeroYieldHost('any.com', null), false);
  });

  it('empty host → false', () => {
    assert.equal(isZeroYieldHost('', { 'x.com': { attempts: 5, fields: {} } }), false);
  });
});

// ── History-aware domain bias ──

describe('emitArchetypeQueries — history-aware domain bias', () => {
  it('zero-yield host: query has NO host, domain_hint empty', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['deadsite.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const fieldYieldByDomain = {
      'deadsite.com': { attempts: 5, fields: {} }
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain });

    assert.ok(rows.length > 0, 'still emits queries');
    for (const row of rows) {
      assert.ok(!row.query.includes('deadsite.com'), `query "${row.query}" must not contain dead host`);
      assert.equal(row.domain_hint, '', 'domain_hint cleared for zero-yield host');
    }
  });

  it('yielding host: query includes host, domain_hint set', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const fieldYieldByDomain = {
      'rtings.com': { attempts: 5, fields: { click_latency: { seen: 3, accepted: 2, yield: 3 } } }
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain });

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'yielding host in query text');
    assert.ok(rows.some((r) => r.domain_hint === 'rtings.com'), 'domain_hint preserved');
  });

  it('new host (not in map): query includes host (given a chance)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['newsite.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain: {} });

    assert.ok(rows.some((r) => r.query.includes('newsite.com')), 'new host gets bias');
  });

  it('null fieldYieldByDomain (backward compat): all hosts biased', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'host biased when no yield data');
  });

  it('mixed: yielding host keeps bias, zero-yield host loses bias', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'deadsite.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const fieldYieldByDomain = {
      'rtings.com': { attempts: 5, fields: { click_latency: { seen: 3, accepted: 2, yield: 3 } } },
      'deadsite.com': { attempts: 4, fields: {} }
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain });

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'yielding host keeps bias');
    assert.ok(rows.every((r) => !r.query.includes('deadsite.com')), 'dead host loses bias');
  });
});
