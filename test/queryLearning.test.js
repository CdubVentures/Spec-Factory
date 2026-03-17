import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultQueryLearning, updateQueryLearning } from '../src/features/indexing/learning/queryLearning.js';

test('updateQueryLearning normalizes required-field paths to raw non-identity keys', () => {
  const artifact = defaultQueryLearning();
  const next = updateQueryLearning({
    artifact,
    summary: {
      validated: false,
      confidence: 0.72,
      missing_required_fields: ['fields.weight', 'identity.brand'],
      critical_fields_below_pass_target: ['fields.dpi']
    },
    job: {
      identityLock: {
        brand: 'Logitech'
      },
      requirements: {
        llmTargetFields: ['fields.polling_rate', 'identity.model']
      }
    },
    discoveryResult: {
      queries: ['logitech g pro x superlight 2 weight specification'],
      candidates: [{ provider: 'google', url: 'https://example.com/specs' }]
    },
    seenAt: '2026-02-10T00:00:00.000Z'
  });

  assert.ok(next.templates_by_field.weight);
  assert.ok(next.templates_by_field.dpi);
  assert.ok(next.templates_by_field.polling_rate);
  assert.equal(Object.prototype.hasOwnProperty.call(next.templates_by_field, 'brand'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(next.templates_by_field, 'model'), false);
});

// ── archetype provenance storage ──

describe('archetype provenance storage', () => {
  function makeSearchProfile() {
    return {
      query_rows: [
        {
          query: 'razer viper v3 pro review site:rtings.com',
          _meta: { archetype: 'lab_review', query_family: 'review' }
        },
        {
          query: 'razer viper v3 pro specifications site:razer.com',
          _meta: { archetype: 'manufacturer', query_family: 'spec' }
        },
        {
          query: 'razer viper v3 pro specs site:eloshapes.com',
          _meta: { archetype: 'spec_database', query_family: 'spec' }
        }
      ]
    };
  }

  it('query entry has archetype and query_family from _meta', () => {
    const artifact = defaultQueryLearning();
    const next = updateQueryLearning({
      artifact,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: ['razer viper v3 pro review site:rtings.com'],
        candidates: [{ provider: 'google' }],
        search_profile: makeSearchProfile()
      },
      seenAt: '2026-03-16T00:00:00.000Z'
    });

    const entry = next.queries['razer viper v3 pro review site:rtings.com'];
    assert.ok(entry, 'query entry exists');
    assert.equal(entry.archetype, 'lab_review', 'archetype set from _meta');
    assert.equal(entry.query_family, 'review', 'query_family set from _meta');
  });

  it('templates_by_archetype.lab_review is non-empty', () => {
    const artifact = defaultQueryLearning();
    const next = updateQueryLearning({
      artifact,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: ['razer viper v3 pro review site:rtings.com'],
        candidates: [{ provider: 'google' }],
        search_profile: makeSearchProfile()
      },
      seenAt: '2026-03-16T00:00:00.000Z'
    });

    assert.ok(next.templates_by_archetype, 'templates_by_archetype exists');
    assert.ok(next.templates_by_archetype.lab_review, 'lab_review bucket exists');
    assert.ok(next.templates_by_archetype.lab_review.length > 0, 'lab_review has entries');

    const entry = next.templates_by_archetype.lab_review[0];
    assert.equal(typeof entry.query, 'string');
    assert.equal(typeof entry.attempts, 'number');
    assert.equal(typeof entry.success_rate, 'number');
  });

  it('mixed archetypes tracked in separate buckets', () => {
    const artifact = defaultQueryLearning();
    const next = updateQueryLearning({
      artifact,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: [
          'razer viper v3 pro review site:rtings.com',
          'razer viper v3 pro specifications site:razer.com'
        ],
        candidates: [{ provider: 'google' }],
        search_profile: makeSearchProfile()
      },
      seenAt: '2026-03-16T00:00:00.000Z'
    });

    assert.ok(next.templates_by_archetype.lab_review, 'lab_review bucket');
    assert.ok(next.templates_by_archetype.manufacturer, 'manufacturer bucket');
    assert.notEqual(
      next.templates_by_archetype.lab_review[0]?.query,
      next.templates_by_archetype.manufacturer[0]?.query,
      'different queries in different buckets'
    );
  });

  it('missing _meta handled gracefully — defaults to empty string', () => {
    const artifact = defaultQueryLearning();
    const next = updateQueryLearning({
      artifact,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: ['razer viper v3 pro weight'],
        candidates: [{ provider: 'google' }],
        search_profile: { query_rows: [{ query: 'razer viper v3 pro weight' }] }
      },
      seenAt: '2026-03-16T00:00:00.000Z'
    });

    const entry = next.queries['razer viper v3 pro weight'];
    assert.ok(entry, 'query entry exists');
    assert.equal(entry.archetype, '', 'archetype defaults to empty');
    assert.equal(entry.query_family, '', 'query_family defaults to empty');
  });

  it('repeated encounters update archetype (last-write-wins)', () => {
    const artifact = defaultQueryLearning();
    const step1 = updateQueryLearning({
      artifact,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: ['razer viper v3 pro specifications'],
        candidates: [{ provider: 'google' }],
        search_profile: {
          query_rows: [{ query: 'razer viper v3 pro specifications', _meta: { archetype: 'manufacturer', query_family: 'spec' } }]
        }
      },
      seenAt: '2026-03-16T00:00:00.000Z'
    });

    const step2 = updateQueryLearning({
      artifact: step1,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: ['razer viper v3 pro specifications'],
        candidates: [{ provider: 'google' }],
        search_profile: {
          query_rows: [{ query: 'razer viper v3 pro specifications', _meta: { archetype: 'spec_database', query_family: 'spec' } }]
        }
      },
      seenAt: '2026-03-17T00:00:00.000Z'
    });

    const entry = step2.queries['razer viper v3 pro specifications'];
    assert.equal(entry.archetype, 'spec_database', 'archetype updated to last-write');
  });

  it('backward compat: templates_by_field and templates_by_brand still populated', () => {
    const artifact = defaultQueryLearning();
    const next = updateQueryLearning({
      artifact,
      summary: { validated: true },
      job: { identityLock: { brand: 'Razer' }, requirements: { focus_fields: ['weight'] } },
      discoveryResult: {
        queries: ['razer viper v3 pro weight spec'],
        candidates: [{ provider: 'google' }],
        search_profile: makeSearchProfile()
      },
      seenAt: '2026-03-16T00:00:00.000Z'
    });

    assert.ok(next.templates_by_field, 'templates_by_field exists');
    assert.ok(next.templates_by_field.weight, 'templates_by_field.weight populated');
    assert.ok(next.templates_by_brand, 'templates_by_brand exists');
    assert.ok(next.templates_by_brand.razer, 'templates_by_brand.razer populated');
  });

  it('defaultQueryLearning includes templates_by_archetype', () => {
    const def = defaultQueryLearning();
    assert.ok(def.templates_by_archetype !== undefined, 'templates_by_archetype in default');
    assert.deepEqual(def.templates_by_archetype, {}, 'starts as empty object');
  });
});
