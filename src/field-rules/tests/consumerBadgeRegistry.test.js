import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSUMER_BADGE_REGISTRY,
  FIELD_PARENT_MAP,
  FIELD_CONSUMER_MAP,
  IDX_FIELD_PATHS,
  BADGE_FIELD_PATHS,
  PARENT_GROUPS,
  NAVIGATION_MAP,
  buildExtractor,
} from '../consumerBadgeRegistry.js';

const VALID_PARENT_PREFIXES = new Set(Object.keys(PARENT_GROUPS));
const VALID_TYPES = new Set(['string', 'array', 'filteredArray', 'presence']);

// WHY: sub-consumer key must match parent.name pattern
const CONSUMER_KEY_RE = /^(idx|eng|rev|flag|seed|comp|val|pub|llm)\.\w+$/;

describe('Registry entry shape', () => {
  it('every entry has required fields', () => {
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      assert.ok(typeof entry.path === 'string' && entry.path.length > 0,
        `entry must have non-empty path, got: ${entry.path}`);
      assert.ok(VALID_TYPES.has(entry.type),
        `${entry.path}: type must be one of ${[...VALID_TYPES]}, got: ${entry.type}`);
      assert.ok(typeof entry.consumers === 'object' && entry.consumers !== null,
        `${entry.path}: consumers must be an object`);
      assert.ok(Object.keys(entry.consumers).length > 0,
        `${entry.path}: consumers must have at least one entry`);
    }
  });

  it('consumer keys match parent.name pattern', () => {
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      for (const key of Object.keys(entry.consumers)) {
        assert.ok(CONSUMER_KEY_RE.test(key),
          `${entry.path}: consumer key "${key}" does not match pattern "parent.name"`);
        const parent = key.split('.')[0];
        assert.ok(VALID_PARENT_PREFIXES.has(parent),
          `${entry.path}: consumer parent "${parent}" is not a valid parent group`);
      }
    }
  });

  it('every consumer entry has a desc string', () => {
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      for (const [key, value] of Object.entries(entry.consumers)) {
        assert.ok(typeof value.desc === 'string' && value.desc.length > 0,
          `${entry.path} → ${key}: desc must be a non-empty string`);
      }
    }
  });

  it('flatAliases is always an array', () => {
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      if (entry.flatAliases !== undefined) {
        assert.ok(Array.isArray(entry.flatAliases),
          `${entry.path}: flatAliases must be an array`);
      }
    }
  });
});

describe('Registry integrity', () => {
  it('no duplicate paths', () => {
    const paths = CONSUMER_BADGE_REGISTRY.map((e) => e.path);
    const unique = new Set(paths);
    assert.equal(paths.length, unique.size, `duplicate paths: ${paths.filter((p, i) => paths.indexOf(p) !== i)}`);
  });

  it('all declared sub-consumers appear at least once', () => {
    const allKeys = new Set();
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      for (const key of Object.keys(entry.consumers)) {
        allKeys.add(key);
      }
    }
    // WHY: rev.grid is the review-grid metadata consumer (reviewGridHelpers.js:134 reads
    // evidence.min_evidence_refs, reviewGridData.js:140 reads variant_dependent). rev.metadata
    // covers componentReviewHelpers.js reads of enum.policy + enum.source. llm.kf is the
    // per-key finder LLM prompt composer (keyLlmAdapter.js reads contract/evidence/aliases/
    // search_hints/etc. for prompt injection). llm.route is tier model selection
    // (keyFinder.js resolvePhaseModelByTier). llm.budget is per-key attempt budget
    // (keyBudgetCalc.js). llm.bundle is passenger packing (keyBundler.js, keyPassengerBuilder.js).
    const expected = [
      'idx.needset', 'idx.search',
      'eng.validate', 'eng.normalize', 'eng.enum', 'eng.list', 'eng.component', 'eng.gate',
      'rev.component', 'rev.grid', 'rev.metadata', 'rev.override',
      'seed.schema', 'seed.component',
      'val.publish_gate',
      'llm.kf', 'llm.route', 'llm.budget', 'llm.bundle',
    ];
    for (const key of expected) {
      assert.ok(allKeys.has(key), `sub-consumer "${key}" not found in any registry entry`);
    }
  });
});

describe('Derived constants', () => {
  it('FIELD_PARENT_MAP has an entry for every registry path', () => {
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      assert.ok(FIELD_PARENT_MAP[entry.path],
        `${entry.path} missing from FIELD_PARENT_MAP`);
      assert.ok(Array.isArray(FIELD_PARENT_MAP[entry.path]));
      for (const parent of FIELD_PARENT_MAP[entry.path]) {
        assert.ok(VALID_PARENT_PREFIXES.has(parent),
          `${entry.path}: parent "${parent}" not in PARENT_GROUPS`);
      }
    }
  });

  it('FIELD_CONSUMER_MAP has an entry for every registry path', () => {
    for (const entry of CONSUMER_BADGE_REGISTRY) {
      assert.ok(FIELD_CONSUMER_MAP[entry.path],
        `${entry.path} missing from FIELD_CONSUMER_MAP`);
      assert.deepStrictEqual(
        Object.keys(FIELD_CONSUMER_MAP[entry.path]).sort(),
        Object.keys(entry.consumers).sort(),
        `${entry.path}: FIELD_CONSUMER_MAP keys mismatch`
      );
    }
  });

  it('IDX_FIELD_PATHS contains only paths with idx.* consumers', () => {
    for (const path of IDX_FIELD_PATHS) {
      const entry = CONSUMER_BADGE_REGISTRY.find((e) => e.path === path);
      assert.ok(entry, `${path} in IDX_FIELD_PATHS but not in registry`);
      const hasIdx = Object.keys(entry.consumers).some((k) => k.startsWith('idx.'));
      assert.ok(hasIdx, `${path} in IDX_FIELD_PATHS but has no idx.* consumer`);
    }
  });

  it('IDX_FIELD_PATHS contains ALL paths with idx.* consumers', () => {
    const expected = CONSUMER_BADGE_REGISTRY
      .filter((e) => Object.keys(e.consumers).some((k) => k.startsWith('idx.')))
      .map((e) => e.path);
    assert.deepStrictEqual([...IDX_FIELD_PATHS].sort(), expected.sort());
  });

  it('BADGE_FIELD_PATHS matches registry length', () => {
    assert.equal(BADGE_FIELD_PATHS.length, CONSUMER_BADGE_REGISTRY.length);
  });

  it('NAVIGATION_MAP entries have section and key', () => {
    for (const [path, nav] of Object.entries(NAVIGATION_MAP)) {
      assert.ok(typeof nav.section === 'string' && nav.section.length > 0,
        `${path}: navigation.section must be a non-empty string`);
      assert.ok(typeof nav.key === 'string' && nav.key.length > 0,
        `${path}: navigation.key must be a non-empty string`);
    }
  });
});

describe('buildExtractor', () => {
  it('string type detects nested path', () => {
    const entry = { path: 'priority.required_level', type: 'string', flatAliases: ['required_level'] };
    const extractor = buildExtractor(entry);
    assert.equal(extractor({ priority: { required_level: 'mandatory' } }), true);
    assert.equal(extractor({ required_level: 'mandatory' }), true);
    assert.equal(extractor({}), false);
    assert.equal(extractor({ priority: { required_level: '' } }), false);
  });

  it('array type detects non-empty arrays', () => {
    const entry = { path: 'aliases', type: 'array', flatAliases: [] };
    const extractor = buildExtractor(entry);
    assert.equal(extractor({ aliases: ['a'] }), true);
    assert.equal(extractor({ aliases: [] }), false);
    assert.equal(extractor({}), false);
  });

  it('filteredArray type filters empty strings', () => {
    const entry = { path: 'search_hints.query_terms', type: 'filteredArray', flatAliases: [] };
    const extractor = buildExtractor(entry);
    assert.equal(extractor({ search_hints: { query_terms: ['weight'] } }), true);
    assert.equal(extractor({ search_hints: { query_terms: ['', '  '] } }), false);
    assert.equal(extractor({ search_hints: { query_terms: [] } }), false);
  });

  it('presence type detects defined values', () => {
    const entry = { path: 'contract.range.min', type: 'presence', flatAliases: [] };
    const extractor = buildExtractor(entry);
    assert.equal(extractor({ contract: { range: { min: 0 } } }), true);
    assert.equal(extractor({ contract: { range: { min: null } } }), true);
    assert.equal(extractor({ contract: { range: {} } }), false);
    assert.equal(extractor({}), false);
  });
});

describe('Backward compatibility', () => {
  it('IDX_FIELD_PATHS includes all paths from the old IDX badge registry', () => {
    const oldIdxPaths = [
      'priority.required_level', 'priority.availability', 'priority.difficulty',
      'group', 'aliases',
      'search_hints.query_terms', 'search_hints.domain_hints', 'search_hints.content_types',
      'ui.tooltip_md', 'ui.label',
    ];
    for (const path of oldIdxPaths) {
      assert.ok(IDX_FIELD_PATHS.includes(path),
        `old IDX path "${path}" missing from IDX_FIELD_PATHS`);
    }
  });

  it('FIELD_PARENT_MAP includes all paths from the old _SEED_REVIEW_MAP', () => {
    const oldSeedReviewPaths = [
      'contract.type', 'contract.shape', 'contract.unit',
      'priority.required_level',
      'enum.policy', 'enum.source',
      'enum.match.format_hint',
      'evidence.min_evidence_refs',
      'constraints', 'component.type',
    ];
    for (const path of oldSeedReviewPaths) {
      assert.ok(FIELD_PARENT_MAP[path],
        `old seed/review path "${path}" missing from FIELD_PARENT_MAP`);
    }
  });
});
