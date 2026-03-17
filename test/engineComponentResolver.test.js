import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleSimilarity, resolveComponentRef } from '../src/engine/engineComponentResolver.js';

// ── simpleSimilarity ──────────────────────────────────────────────────────────

test('simpleSimilarity returns 1 for identical strings', () => {
  assert.equal(simpleSimilarity('PAW3395', 'PAW3395'), 1);
  assert.equal(simpleSimilarity('hello', 'HELLO'), 1);
});

test('simpleSimilarity returns 0 for empty strings', () => {
  assert.equal(simpleSimilarity('', 'hello'), 0);
  assert.equal(simpleSimilarity('hello', ''), 0);
  assert.equal(simpleSimilarity('', ''), 0);
});

test('simpleSimilarity substring containment returns length ratio', () => {
  const score = simpleSimilarity('PAW', 'PAW3395');
  assert.ok(score > 0 && score < 1);
});

test('simpleSimilarity character overlap for non-contained strings', () => {
  const score = simpleSimilarity('abc', 'xyz');
  assert.equal(score, 0);
  const partial = simpleSimilarity('abc', 'abd');
  assert.ok(partial > 0);
});

// ── resolveComponentRef: exact match ──────────────────────────────────────────

test('resolveComponentRef exact match returns canonical name', () => {
  const attempts = [];
  const context = { identityObservations: [] };
  const result = resolveComponentRef('pixart 3395', {
    rule: { component_db_ref: 'sensor' },
    fieldKey: 'sensor',
    rawCandidate: 'pixart 3395',
    lookupComponent: (db, q) => q === 'pixart 3395' ? { canonical_name: 'PAW3395' } : null,
    fuzzyMatchComponent: () => ({ match: null, score: 0, alternatives: [] }),
    rules: {},
    context,
    attempts
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, 'PAW3395');
  assert.ok(attempts.includes('component:exact_or_alias'));
  assert.equal(context.identityObservations.length, 1);
  assert.equal(context.identityObservations[0].match_type, 'exact_or_alias');
});

// ── resolveComponentRef: missing db ───────────────────────────────────────────

test('resolveComponentRef returns component_db_missing when no db configured', () => {
  const attempts = [];
  const result = resolveComponentRef('PAW3395', {
    rule: {},
    fieldKey: 'sensor',
    rawCandidate: 'PAW3395',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({ match: null, score: 0, alternatives: [] }),
    rules: {},
    context: {},
    attempts
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'component_db_missing');
});

// ── resolveComponentRef: auto-accept (high score) ─────────────────────────────

test('resolveComponentRef auto-accepts when combined score >= auto_accept_score', () => {
  const attempts = [];
  const context = { identityObservations: [] };
  const result = resolveComponentRef('PAW 3395', {
    rule: { component_db_ref: 'sensor' },
    fieldKey: 'sensor',
    rawCandidate: 'PAW 3395',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({
      match: { canonical_name: 'PAW3395', properties: {} },
      score: 0.96,
      alternatives: []
    }),
    rules: {},
    context,
    attempts
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, 'PAW3395');
  assert.ok(attempts.some(a => a.startsWith('component:auto_accept')));
  assert.equal(context.identityObservations[0].match_type, 'fuzzy_auto_accepted');
});

// ── resolveComponentRef: flagged review (medium score) ────────────────────────

test('resolveComponentRef flags for review when score >= flag_review_score but < auto_accept', () => {
  const attempts = [];
  const context = { componentReviewQueue: [] };
  const result = resolveComponentRef('PAW3300', {
    rule: { component_db_ref: 'sensor' },
    fieldKey: 'sensor',
    rawCandidate: 'PAW3300',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({
      match: { canonical_name: 'PAW3395', properties: {} },
      score: 0.80,
      alternatives: [{ canonical_name: 'PAW3395', score: 0.80 }]
    }),
    rules: {},
    context,
    attempts
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, 'PAW3395');
  assert.ok(attempts.some(a => a.startsWith('component:flagged_review')));
  assert.equal(context.componentReviewQueue.length, 1);
  assert.equal(context.componentReviewQueue[0].match_type, 'fuzzy_flagged');
});

// ── resolveComponentRef: new component suggestion ─────────────────────────────

test('resolveComponentRef suggests new component when allow_new_components is true', () => {
  const attempts = [];
  const context = { componentReviewQueue: [], curationQueue: [] };
  const result = resolveComponentRef('HERO X2', {
    rule: {
      component_db_ref: 'sensor',
      component: { allow_new_components: true }
    },
    fieldKey: 'sensor',
    rawCandidate: 'HERO X2',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({ match: null, score: 0.2, alternatives: [] }),
    rules: {},
    context,
    attempts
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, 'HERO X2');
  assert.ok(attempts.includes('component:new_suggestion_flagged'));
  assert.equal(context.componentReviewQueue.length, 1);
  assert.equal(context.componentReviewQueue[0].match_type, 'new_component');
  assert.equal(context.curationQueue.length, 1);
  assert.equal(context.curationQueue[0].suggestion_type, 'new_component');
});

// ── resolveComponentRef: rejection (no match, not allowed) ────────────────────

test('resolveComponentRef returns component_not_found when no match and no allow_new', () => {
  const attempts = [];
  const result = resolveComponentRef('HERO X2', {
    rule: { component_db_ref: 'sensor' },
    fieldKey: 'sensor',
    rawCandidate: 'HERO X2',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({ match: null, score: 0.2, alternatives: [] }),
    rules: {},
    context: {},
    attempts
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'component_not_found');
});

// ── resolveComponentRef: property-aware scoring ───────────────────────────────

test('resolveComponentRef uses property scoring with variance policies', () => {
  const attempts = [];
  const context = { identityObservations: [], extractedValues: { max_dpi: 26000 } };
  const result = resolveComponentRef('PAW 3395', {
    rule: {
      component_db_ref: 'sensor',
      component: {
        match: {
          name_weight: 0.4,
          property_weight: 0.6,
          property_keys: ['max_dpi'],
          auto_accept_score: 0.90
        }
      }
    },
    fieldKey: 'sensor',
    rawCandidate: 'PAW 3395',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({
      match: {
        canonical_name: 'PAW3395',
        properties: { max_dpi: 26000 },
        __variance_policies: { max_dpi: 'authoritative' }
      },
      score: 0.85,
      alternatives: []
    }),
    rules: {
      max_dpi: { contract: { type: 'number', shape: 'scalar' } }
    },
    context,
    attempts
  });
  // name_score=0.85 * 0.4 = 0.34, prop_score=1.0 * 0.6 = 0.6, combined=0.94 >= 0.90
  assert.equal(result.ok, true);
  assert.equal(result.value, 'PAW3395');
  assert.ok(attempts.some(a => a.startsWith('component:auto_accept')));
});

test('resolveComponentRef upper_bound variance gives full credit when extracted <= known', () => {
  const attempts = [];
  const context = { identityObservations: [], extractedValues: { max_dpi: 20000 } };
  const result = resolveComponentRef('PAW 3395', {
    rule: {
      component_db_ref: 'sensor',
      component: {
        match: {
          name_weight: 0.4,
          property_weight: 0.6,
          property_keys: ['max_dpi'],
          auto_accept_score: 0.90
        }
      }
    },
    fieldKey: 'sensor',
    rawCandidate: 'PAW 3395',
    lookupComponent: () => null,
    fuzzyMatchComponent: () => ({
      match: {
        canonical_name: 'PAW3395',
        properties: { max_dpi: 26000 },
        __variance_policies: { max_dpi: 'upper_bound' }
      },
      score: 0.85,
      alternatives: []
    }),
    rules: {
      max_dpi: { contract: { type: 'number', shape: 'scalar' } }
    },
    context,
    attempts
  });
  // prop_score should be 1.0 (20000 <= 26000)
  assert.equal(result.ok, true);
  assert.equal(result.value, 'PAW3395');
});
