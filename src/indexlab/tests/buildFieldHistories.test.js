import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  classifyHostClass,
  classifyEvidenceClass
} from '../buildFieldHistories.js';

// --- Factories ---

function makeEvidence(overrides = {}) {
  return {
    url: 'https://example.com/page',
    host: 'example.com',
    rootDomain: 'example.com',
    tier: 2,
    tierName: 'review',
    method: 'dom',
    ...overrides
  };
}

function makeQuery(overrides = {}) {
  return {
    query: 'test query',
    query_hash: 'hash_abc',
    family: 'manufacturer_html',
    target_fields: ['sensor_brand'],
    group_keys: ['core_specs'],
    ...overrides
  };
}

function emptyHistory() {
  return {
    existing_queries: [],
    domains_tried: [],
    host_classes_tried: [],
    evidence_classes_tried: [],
    query_count: 0,
    urls_examined_count: 0,
    no_value_attempts: 0,
    duplicate_attempts_suppressed: 0
  };
}

// ============================================================
// classifyHostClass — domain→host class classifier
// ============================================================

test('classifyHostClass', async (t) => {
  await t.test('tier 1 manufacturer → official', () => {
    assert.equal(classifyHostClass({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com' }), 'official');
  });

  await t.test('tier 1 with support in host → support', () => {
    assert.equal(classifyHostClass({ tier: 1, tierName: 'manufacturer', host: 'support.logi.com' }), 'support');
  });

  await t.test('tier 1 with support in url path → support', () => {
    assert.equal(classifyHostClass({ tier: 1, tierName: 'manufacturer', host: 'logi.com', url: 'https://logi.com/support/specs' }), 'support');
  });

  await t.test('tierName review → review', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'review', host: 'rtings.com' }), 'review');
  });

  await t.test('tierName retailer → retailer', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'retailer', host: 'amazon.com' }), 'retailer');
  });

  await t.test('tier 2 with benchmark host pattern → benchmark', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'professional', host: 'userbenchmark.com' }), 'benchmark');
  });

  await t.test('tier 2 database host → database', () => {
    assert.equal(classifyHostClass({ tier: 2, tierName: 'professional', host: 'techpowerup.com' }), 'database');
  });

  await t.test('tier 3 → community', () => {
    assert.equal(classifyHostClass({ tier: 3, tierName: 'community', host: 'reddit.com' }), 'community');
  });

  await t.test('unknown tier → fallback', () => {
    assert.equal(classifyHostClass({ tier: 99, tierName: '', host: 'unknown.xyz' }), 'fallback');
  });

  await t.test('null/undefined input → fallback', () => {
    assert.equal(classifyHostClass(null), 'fallback');
    assert.equal(classifyHostClass(undefined), 'fallback');
    assert.equal(classifyHostClass({}), 'fallback');
  });
});

// ============================================================
// classifyEvidenceClass — evidence→evidence class classifier
// ============================================================

test('classifyEvidenceClass', async (t) => {
  await t.test('tier 1 html → manufacturer_html', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'logitechg.com' }), 'manufacturer_html');
  });

  await t.test('tier 1 pdf method → manual_pdf', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'pdf_table', host: 'logitechg.com' }), 'manual_pdf');
  });

  await t.test('tier 1 url ending in .pdf → manual_pdf', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'logitechg.com', url: 'https://logitechg.com/manual.pdf' }), 'manual_pdf');
  });

  await t.test('tier 1 support host → support_docs', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'support.logi.com' }), 'support_docs');
  });

  await t.test('tierName review → review', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'review', method: 'dom', host: 'rtings.com' }), 'review');
  });

  await t.test('tierName retailer → retailer', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'retailer', method: 'dom', host: 'amazon.com' }), 'retailer');
  });

  await t.test('tier 2 benchmark host → benchmark', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'professional', method: 'dom', host: 'userbenchmark.com' }), 'benchmark');
  });

  await t.test('tier 2 database → database', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'professional', method: 'dom', host: 'techpowerup.com' }), 'database');
  });

  await t.test('tier 3 → fallback_web', () => {
    assert.equal(classifyEvidenceClass({ tier: 3, tierName: 'community', method: 'dom', host: 'reddit.com' }), 'fallback_web');
  });

  await t.test('null input → fallback_web', () => {
    assert.equal(classifyEvidenceClass(null), 'fallback_web');
    assert.equal(classifyEvidenceClass({}), 'fallback_web');
  });
});

// ============================================================
// buildFieldHistories — round 0 (seed) behavior
// ============================================================

test('buildFieldHistories — round 0 produces empty histories', async (t) => {
  await t.test('returns empty map when no provenance or queries', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {},
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });
    assert.deepStrictEqual(result, {});
  });

  await t.test('creates entries for fields targeted by queries even with no evidence', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: { sensor_brand: { value: 'unk', evidence: [] } },
      searchPlanQueries: [
        makeQuery({ query: 'logitech sensor specs', query_hash: 'h1', target_fields: ['sensor_brand', 'sensor_model'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.ok(result.sensor_brand);
    assert.ok(result.sensor_model);
    assert.deepStrictEqual(result.sensor_brand.existing_queries, ['logitech sensor specs']);
    assert.equal(result.sensor_brand.query_count, 1);
  });
});

// ============================================================
// buildFieldHistories — carry forward (round 1+)
// ============================================================

test('buildFieldHistories — carry forward preserves previous history', async (t) => {
  await t.test('merges previous queries with new queries', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          existing_queries: ['old query'],
          query_count: 1,
        }
      },
      provenance: { sensor_brand: { value: 'unk', evidence: [] } },
      searchPlanQueries: [
        makeQuery({ query: 'new query', query_hash: 'h2', target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.deepStrictEqual(result.sensor_brand.existing_queries, ['new query', 'old query']);
    assert.equal(result.sensor_brand.query_count, 2);
  });

  await t.test('deduplicates queries', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          existing_queries: ['logitech sensor specs'],
          query_count: 1,
        }
      },
      provenance: {},
      searchPlanQueries: [
        makeQuery({ query: 'logitech sensor specs', query_hash: 'h1', target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.deepStrictEqual(result.sensor_brand.existing_queries, ['logitech sensor specs']);
    assert.equal(result.sensor_brand.query_count, 2);
  });

  await t.test('merges domains_tried from evidence', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          domains_tried: ['logitechg.com'],
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ rootDomain: 'rtings.com', tier: 2, tierName: 'review' }),
            makeEvidence({ rootDomain: 'logitechg.com', tier: 1, tierName: 'manufacturer' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const domains = result.sensor_brand.domains_tried;
    assert.ok(domains.includes('logitechg.com'));
    assert.ok(domains.includes('rtings.com'));
    assert.equal(domains.length, 2);
  });
});

// ============================================================
// buildFieldHistories — host_classes_tried derivation
// ============================================================

test('buildFieldHistories — host_classes_tried classification', async (t) => {
  await t.test('derives host classes from evidence tier/host', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com', rootDomain: 'logitechg.com' }),
            makeEvidence({ tier: 2, tierName: 'review', host: 'rtings.com', rootDomain: 'rtings.com' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const hc = result.sensor_brand.host_classes_tried;
    assert.ok(hc.includes('official'));
    assert.ok(hc.includes('review'));
  });

  await t.test('deduplicates host classes', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          host_classes_tried: ['official'],
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com', rootDomain: 'logitechg.com' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const hc = result.sensor_brand.host_classes_tried;
    assert.equal(hc.filter((c) => c === 'official').length, 1);
  });
});

// ============================================================
// buildFieldHistories — evidence_classes_tried derivation
// ============================================================

test('buildFieldHistories — evidence_classes_tried classification', async (t) => {
  await t.test('derives evidence classes from evidence properties', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'logitechg.com', rootDomain: 'logitechg.com' }),
            makeEvidence({ tier: 1, tierName: 'manufacturer', method: 'pdf_table', host: 'logitechg.com', rootDomain: 'logitechg.com', url: 'https://logitechg.com/spec.pdf' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const ec = result.sensor_brand.evidence_classes_tried;
    assert.ok(ec.includes('manufacturer_html'));
    assert.ok(ec.includes('manual_pdf'));
  });

  await t.test('merges with previous evidence classes', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          evidence_classes_tried: ['retailer'],
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 2, tierName: 'review', method: 'dom', host: 'rtings.com', rootDomain: 'rtings.com' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const ec = result.sensor_brand.evidence_classes_tried;
    assert.ok(ec.includes('retailer'));
    assert.ok(ec.includes('review'));
  });
});

// ============================================================
// buildFieldHistories — no-value detection
// ============================================================

test('buildFieldHistories — no-value attempt tracking', async (t) => {
  await t.test('increments no_value_attempts when field was targeted but value unchanged', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          no_value_attempts: 1,
        }
      },
      provenance: {
        sensor_brand: { value: 'unk', evidence: [] }
      },
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.no_value_attempts, 2);
  });

  await t.test('does NOT increment when field got a real value', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          no_value_attempts: 1,
        }
      },
      provenance: {
        sensor_brand: { value: 'HERO 2', evidence: [makeEvidence()] }
      },
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.no_value_attempts, 1);
  });

  await t.test('does NOT increment when field was not targeted', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          no_value_attempts: 0,
        }
      },
      provenance: {
        sensor_brand: { value: 'unk', evidence: [] }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.no_value_attempts, 0);
  });
});

// ============================================================
// buildFieldHistories — urls_examined_count
// ============================================================

test('buildFieldHistories — urls_examined_count tracking', async (t) => {
  await t.test('counts unique evidence URLs per field', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ url: 'https://a.com/1' }),
            makeEvidence({ url: 'https://a.com/2' }),
            makeEvidence({ url: 'https://a.com/1' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.urls_examined_count, 2);
  });

  await t.test('accumulates with previous count', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          urls_examined_count: 3,
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [makeEvidence({ url: 'https://new.com/1' })]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.urls_examined_count, 4);
  });
});

// ============================================================
// buildFieldHistories — duplicates_suppressed distribution
// ============================================================

test('buildFieldHistories — duplicates_suppressed', async (t) => {
  await t.test('distributes global suppression count across targeted fields', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {},
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand', 'sensor_model'] }),
      ],
      duplicatesSuppressed: 4,
    });

    // Each targeted field gets the total count
    assert.equal(result.sensor_brand.duplicate_attempts_suppressed, 4);
    assert.equal(result.sensor_model.duplicate_attempts_suppressed, 4);
  });

  await t.test('accumulates with previous suppression count', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          duplicate_attempts_suppressed: 2,
        }
      },
      provenance: {},
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand'] }),
      ],
      duplicatesSuppressed: 3,
    });

    assert.equal(result.sensor_brand.duplicate_attempts_suppressed, 5);
  });
});

// ============================================================
// buildFieldHistories — edge cases
// ============================================================

test('buildFieldHistories — edge cases', async (t) => {
  await t.test('handles null/undefined inputs gracefully', () => {
    const result = buildFieldHistories({
      previousFieldHistories: null,
      provenance: null,
      searchPlanQueries: null,
      duplicatesSuppressed: null,
    });
    assert.deepStrictEqual(result, {});
  });

  await t.test('handles evidence with missing properties', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [{ url: 'https://x.com' }]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.ok(result.sensor_brand);
    assert.ok(Array.isArray(result.sensor_brand.domains_tried));
  });

  await t.test('handles query with empty target_fields', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {},
      searchPlanQueries: [makeQuery({ target_fields: [] })],
      duplicatesSuppressed: 0,
    });
    assert.deepStrictEqual(result, {});
  });

  await t.test('output history shape matches Schema 1 field.history exactly', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: { value: 'HERO 2', evidence: [makeEvidence()] }
      },
      searchPlanQueries: [makeQuery({ target_fields: ['sensor_brand'] })],
      duplicatesSuppressed: 1,
    });

    const hist = result.sensor_brand;
    const requiredKeys = [
      'existing_queries', 'domains_tried', 'host_classes_tried',
      'evidence_classes_tried', 'query_count', 'urls_examined_count',
      'no_value_attempts', 'duplicate_attempts_suppressed'
    ];
    for (const key of requiredKeys) {
      assert.ok(key in hist, `missing key: ${key}`);
    }
    assert.equal(Object.keys(hist).length, requiredKeys.length, 'no extra keys');
  });
});

// ============================================================
// buildFieldHistories — multi-field multi-query integration
// ============================================================

test('buildFieldHistories — integration: multi-field multi-query round', async () => {
  const result = buildFieldHistories({
    previousFieldHistories: {
      sensor_brand: {
        ...emptyHistory(),
        existing_queries: ['old sensor query'],
        domains_tried: ['logitechg.com'],
        host_classes_tried: ['official'],
        evidence_classes_tried: ['manufacturer_html'],
        query_count: 1,
        urls_examined_count: 2,
        no_value_attempts: 0,
        duplicate_attempts_suppressed: 0,
      },
      dpi_max: {
        ...emptyHistory(),
        existing_queries: ['old dpi query'],
        query_count: 1,
        no_value_attempts: 1,
      }
    },
    provenance: {
      sensor_brand: {
        value: 'HERO 2',
        evidence: [
          makeEvidence({ tier: 2, tierName: 'review', host: 'rtings.com', rootDomain: 'rtings.com', url: 'https://rtings.com/mouse/review' }),
        ]
      },
      dpi_max: {
        value: 'unk',
        evidence: []
      },
      weight: {
        value: '63g',
        evidence: [
          makeEvidence({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com', rootDomain: 'logitechg.com', url: 'https://logitechg.com/specs' }),
        ]
      }
    },
    searchPlanQueries: [
      makeQuery({ query: 'logitech sensor review', query_hash: 'h1', target_fields: ['sensor_brand', 'dpi_max'] }),
      makeQuery({ query: 'logitech gpx2 weight', query_hash: 'h2', target_fields: ['weight'] }),
    ],
    duplicatesSuppressed: 2,
  });

  // sensor_brand: had previous history, got new evidence from rtings, was targeted
  assert.ok(result.sensor_brand.existing_queries.includes('old sensor query'));
  assert.ok(result.sensor_brand.existing_queries.includes('logitech sensor review'));
  assert.equal(result.sensor_brand.query_count, 2);
  assert.ok(result.sensor_brand.domains_tried.includes('logitechg.com'));
  assert.ok(result.sensor_brand.domains_tried.includes('rtings.com'));
  assert.ok(result.sensor_brand.host_classes_tried.includes('official'));
  assert.ok(result.sensor_brand.host_classes_tried.includes('review'));
  assert.ok(result.sensor_brand.evidence_classes_tried.includes('manufacturer_html'));
  assert.ok(result.sensor_brand.evidence_classes_tried.includes('review'));
  assert.equal(result.sensor_brand.no_value_attempts, 0);

  // dpi_max: was targeted, still unk → no_value_attempts increments
  assert.ok(result.dpi_max.existing_queries.includes('old dpi query'));
  assert.ok(result.dpi_max.existing_queries.includes('logitech sensor review'));
  assert.equal(result.dpi_max.query_count, 2);
  assert.equal(result.dpi_max.no_value_attempts, 2);

  // weight: has evidence, was targeted, got value
  assert.ok(result.weight.existing_queries.includes('logitech gpx2 weight'));
  assert.equal(result.weight.query_count, 1);
  assert.ok(result.weight.domains_tried.includes('logitechg.com'));
  assert.equal(result.weight.no_value_attempts, 0);
});
