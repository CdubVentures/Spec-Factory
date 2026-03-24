import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicAliases, buildSearchProfile, buildTargetedQueries } from '../../pipeline/searchProfile/queryBuilder.js';

test('buildTargetedQueries uses normalized missing fields and produces tier-based queries', () => {
  // WHY: Tier-only pipeline with seedStatus=null synthesizes specs_seed.is_needed=true.
  // Queries are tier-based (seed query), not archetype-based tooltip expansions.
  const queries = buildTargetedQueries({
    job: {
      category: 'mouse',
      identityLock: {
        brand: 'Logitech',
        model: 'G Pro X Superlight 2',
        variant: 'Wireless'
      }
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['weight', 'polling_rate'],
      sourceHosts: [
        { host: 'logitechg.com', tierName: 'manufacturer' },
        { host: 'razer.com', tierName: 'manufacturer' }
      ],
      searchTemplates: []
    },
    missingFields: ['fields.polling_rate'],
    tooltipHints: {
      polling_rate: ['report rate', 'polling interval']
    },
    lexicon: {},
    learnedQueries: {},
    maxQueries: 20
  });

  assert.ok(queries.length > 0, 'queries emitted');
  // WHY: Tier-only with synthesized seedStatus produces "Logitech G Pro X Superlight 2 Wireless specifications"
  assert.ok(queries.some((row) => row.includes('Logitech') && row.includes('G Pro X Superlight 2')), 'brand+model in query');
  assert.equal(queries.some((row) => row.includes('site:')), false, 'no site: operators');
});

test('buildSearchProfile emits tier-based provenance and identity aliases', () => {
  // WHY: Tier-only pipeline with seedStatus=null synthesizes specs_seed.is_needed=true.
  // Queries are tier1_seed, not field_rules.search_hints.
  const profile = buildSearchProfile({
    job: {
      category: 'mouse',
      identityLock: {
        brand: 'Alienware',
        model: 'AW610M',
        variant: ''
      }
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['polling_rate'],
      sourceHosts: [
        { host: 'alienware.com', tierName: 'manufacturer' }
      ],
      searchTemplates: [],
      fieldRules: {
        fields: {
          polling_rate: {
            search_hints: {
              query_terms: ['polling_rate', 'report rate'],
              domain_hints: ['support.dell.com'],
              preferred_content_types: ['manual_pdf']
            },
            ui: {
              tooltip_md: 'Polling rate in Hz'
            }
          }
        }
      }
    },
    missingFields: ['polling_rate'],
    maxQueries: 24
  });

  assert.equal(Array.isArray(profile.identity_aliases), true);
  assert.equal(profile.identity_aliases.some((row) => row.alias === 'aw610m'), true);
  // WHY: Tier-only pipeline emits tier1_seed hint_source, not field_rules.search_hints
  assert.equal(profile.query_rows.some((row) => row.hint_source === 'tier1_seed'), true, 'tier1_seed provenance present');
  assert.equal(profile.queries.some((query) => query.includes('site:')), false, 'no site: operators');
});

test('buildSearchProfile falls back to top-level job identity when identityLock is absent', () => {
  const profile = buildSearchProfile({
    job: {
      category: 'mouse',
      brand: 'Logitech',
      model: 'G Pro X Superlight 2',
      variant: ''
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['connection'],
      sourceHosts: [
        { host: 'logitechg.com', tierName: 'manufacturer' }
      ],
      searchTemplates: ['{brand} {model} specifications'],
      fieldRules: {
        fields: {
          connection: {
            search_hints: {
              query_terms: ['connection'],
              preferred_content_types: ['manual_pdf']
            }
          }
        }
      }
    },
    missingFields: ['connection'],
    maxQueries: 24
  });

  assert.equal(profile.identity.brand, 'Logitech');
  assert.equal(profile.identity.model, 'G Pro X Superlight 2');
  assert.ok(profile.identity_aliases.length > 0, 'expected deterministic aliases from top-level identity');
  assert.ok(profile.variant_guard_terms.length > 0, 'expected variant guard terms from top-level identity');
  assert.ok(profile.queries.some((query) => query.includes('Logitech G Pro X Superlight 2')));
});

test('buildDeterministicAliases emits spacing and hyphen model variants', () => {
  const aliases = buildDeterministicAliases({
    brand: 'Alienware',
    model: 'AW610M',
    variant: ''
  });
  const tokens = aliases.map((row) => row.alias);
  assert.equal(tokens.includes('aw610m'), true);
  assert.equal(tokens.includes('aw-610-m') || tokens.includes('aw-610m'), true);
  assert.equal(tokens.includes('aw 610 m') || tokens.includes('aw 610m'), true);
});

test('buildSearchProfile emits field rule gate counts with off vs zero states', () => {
  const profile = buildSearchProfile({
    job: {
      category: 'mouse',
      identityLock: {
        brand: 'Alienware',
        model: 'AW610M',
        variant: ''
      }
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['polling_rate', 'sensor', 'dpi'],
      sourceHosts: [
        { host: 'alienware.com', tierName: 'manufacturer' }
      ],
      searchTemplates: [],
      fieldRules: {
        fields: {
          polling_rate: {
            search_hints: {
              query_terms: ['polling rate']
            }
          },
          sensor: {
            search_hints: {
              domain_hints: ['rtings.com']
            },
            consumers: {
              'search_hints.domain_hints': {
                indexlab: false
              }
            }
          },
          dpi: {
            search_hints: {
              preferred_content_types: []
            }
          }
        }
      }
    },
    missingFields: ['polling_rate', 'sensor', 'dpi'],
    maxQueries: 24
  });

  const counts = profile.field_rule_gate_counts || {};
  assert.deepEqual(counts['search_hints.query_terms'], {
    value_count: 1,
    total_value_count: 1,
    effective_value_count: 1,
    enabled_field_count: 1,
    disabled_field_count: 0,
    status: 'active'
  });
  assert.deepEqual(counts['search_hints.domain_hints'], {
    value_count: 0,
    total_value_count: 0,
    effective_value_count: 0,
    enabled_field_count: 0,
    disabled_field_count: 1,
    status: 'off'
  });
  assert.deepEqual(counts['search_hints.preferred_content_types'], {
    value_count: 0,
    total_value_count: 0,
    effective_value_count: 0,
    enabled_field_count: 1,
    disabled_field_count: 0,
    status: 'zero'
  });
  const byField = profile.field_rule_hint_counts_by_field || {};
  assert.deepEqual(byField.polling_rate?.query_terms, {
    value_count: 1,
    total_value_count: 1,
    effective_value_count: 1,
    status: 'active'
  });
  assert.deepEqual(byField.sensor?.domain_hints, {
    value_count: 0,
    total_value_count: 0,
    effective_value_count: 0,
    status: 'off'
  });
  assert.deepEqual(byField.dpi?.preferred_content_types, {
    value_count: 0,
    total_value_count: 0,
    effective_value_count: 0,
    status: 'zero'
  });
  assert.equal(profile.queries.some((query) => query.includes('site:rtings.com')), false);
});

test('buildSearchProfile keeps token-only domain_hints as 0/N effective counts', () => {
  const profile = buildSearchProfile({
    job: {
      category: 'mouse',
      identityLock: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: ''
      }
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['weight'],
      sourceHosts: [
        { host: 'razer.com', tierName: 'manufacturer' }
      ],
      searchTemplates: [],
      fieldRules: {
        fields: {
          weight: {
            search_hints: {
              query_terms: ['weight'],
              domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
              preferred_content_types: ['spec']
            }
          }
        }
      }
    },
    missingFields: ['weight'],
    maxQueries: 24
  });

  const counts = profile.field_rule_gate_counts || {};
  assert.deepEqual(counts['search_hints.domain_hints'], {
    value_count: 0,
    total_value_count: 4,
    effective_value_count: 0,
    enabled_field_count: 1,
    disabled_field_count: 0,
    status: 'zero'
  });
  assert.deepEqual(profile.field_rule_hint_counts_by_field?.weight?.domain_hints, {
    value_count: 0,
    total_value_count: 4,
    effective_value_count: 0,
    status: 'zero'
  });
  // WHY: site: removed — manufacturer host queries now use soft host bias, no site: operator
  assert.equal(profile.queries.some((query) => query.includes('site:')), false);
});

test('buildSearchProfile ignores tooltip-derived IDX terms when ui.tooltip_md is disabled for indexlab', () => {
  // WHY: Tier-only pipeline with tier3 key rows can expose tooltip terms if consumer gates
  // are not respected. Verify disabled tooltip_md terms don't leak into queries.
  const profile = buildSearchProfile({
    job: {
      category: 'mouse',
      identityLock: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: ''
      }
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['polling_rate'],
      sourceHosts: [
        { host: 'razer.com', tierName: 'manufacturer' }
      ],
      searchTemplates: [],
      fieldRules: {
        fields: {
          polling_rate: {
            ui: {
              tooltip_md: 'Precision cadence verification string in Hz'
            },
            consumers: {
              'ui.tooltip_md': {
                indexlab: false
              }
            }
          }
        }
      }
    },
    tooltipHints: {
      polling_rate: ['precision cadence']
    },
    missingFields: ['polling_rate'],
    maxQueries: 24,
    seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    focusGroups: [
      { key: 'polling_group', label: 'Polling Rate', group_search_worthy: false,
        normalized_key_queue: ['polling_rate'], unresolved_field_keys: ['polling_rate'],
        field_keys: ['polling_rate'], satisfied_field_keys: [], productivity_score: 50,
        group_description_short: 'polling rate', group_description_long: 'polling rate hz',
        query_terms_union: [], domain_hints_union: [], preferred_content_types_union: [],
        domains_tried_union: [], aliases_union: [], total_field_count: 1,
        resolved_field_count: 0, coverage_ratio: 0, phase: 'now',
        skip_reason: null, desc: 'polling rate' },
    ],
  });

  assert.equal(
    profile.queries.some((query) => query.includes('precision cadence')),
    false,
    'ui.tooltip_md should not leak tooltip-derived query terms into IndexLab when the IDX consumer is disabled'
  );
  // WHY: tier3 key row for polling_rate produces a query containing "polling rate"
  assert.equal(
    profile.queries.some((query) => query.includes('polling rate')),
    true,
    'tier3 key search produces polling rate query'
  );
});
