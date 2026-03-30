import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../specDb.js';

// WHY: Characterization test for persistSourceIntelFull → loadSourceIntelDomains
// SQL round-trip. Locks down current behavior before schema consolidation.

test('persistSourceIntelFull → loadSourceIntelDomains round-trip preserves all scopes', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  const domains = {
    'example.com': {
      attempts: 5,
      http_ok_count: 4,
      identity_match_count: 3,
      major_anchor_conflict_count: 0,
      fields_contributed_count: 10,
      fields_accepted_count: 8,
      accepted_critical_fields_count: 2,
      products_seen: 3,
      approved_attempts: 2,
      candidate_attempts: 1,
      parser_runs: 10,
      parser_success_count: 9,
      parser_health_score_total: 0.9,
      endpoint_signal_count: 5,
      endpoint_signal_score_total: 0.8,
      planner_score: 0.75,
      field_reward_strength: 0.6,
      recent_products: ['p1', 'p2'],
      per_field_helpfulness: { dpi: 0.9, weight: 0.7 },
      fingerprint_counts: { a: 1 },
      extra_stats: { note: 'test' },
      last_seen_at: '2026-03-30T00:00:00Z',
      updated_at: '2026-03-30T00:00:00Z',
      field_method_reward: {
        'dpi::extract': {
          field: 'dpi',
          method: 'extract',
          seen_count: 5,
          success_count: 4,
          fail_count: 1,
          contradiction_count: 0,
          success_rate: 0.8,
          contradiction_rate: 0,
          reward_score: 0.7,
          last_seen_at: '2026-03-30T00:00:00Z',
        }
      },
      per_brand: {
        razer: {
          brand: 'Razer',
          attempts: 3,
          http_ok_count: 2,
          identity_match_count: 2,
          major_anchor_conflict_count: 0,
          fields_contributed_count: 6,
          fields_accepted_count: 5,
          accepted_critical_fields_count: 1,
          products_seen: 2,
          recent_products: ['p1'],
          per_field_helpfulness: { dpi: 0.8 },
          extra_stats: {},
          last_seen_at: '2026-03-30T00:00:00Z',
          field_method_reward: {
            'dpi::extract': {
              field: 'dpi',
              method: 'extract',
              seen_count: 2,
              success_count: 2,
              reward_score: 0.9,
            }
          }
        }
      },
      per_path: {
        '/products': {
          attempts: 2,
          http_ok_count: 2,
          identity_match_count: 1,
          major_anchor_conflict_count: 0,
          fields_contributed_count: 4,
          fields_accepted_count: 3,
          accepted_critical_fields_count: 1,
          products_seen: 1,
          recent_products: ['p2'],
          per_field_helpfulness: { weight: 0.5 },
          extra_stats: {},
          last_seen_at: '2026-03-30T00:00:00Z',
          field_method_reward: {
            'weight::extract': {
              field: 'weight',
              method: 'extract',
              seen_count: 1,
              success_count: 1,
              reward_score: 0.5,
            }
          }
        }
      }
    }
  };

  specDb.persistSourceIntelFull('mouse', domains);
  const loaded = specDb.loadSourceIntelDomains('mouse');

  assert.ok(loaded, 'loadSourceIntelDomains should return data');
  assert.equal(loaded.category, 'mouse');

  const domain = loaded.domains['example.com'];
  assert.ok(domain, 'domain should exist');

  // Domain-level metrics
  assert.equal(domain.attempts, 5);
  assert.equal(domain.planner_score, 0.75);
  assert.equal(domain.parser_runs, 10);
  assert.equal(domain.products_seen, 3);
  assert.deepEqual(domain.recent_products, ['p1', 'p2']);
  assert.deepEqual(domain.per_field_helpfulness, { dpi: 0.9, weight: 0.7 });

  // Domain field_method_reward
  assert.ok(domain.field_method_reward['dpi::extract'], 'domain reward should exist');
  assert.equal(domain.field_method_reward['dpi::extract'].success_count, 4);

  // Brand round-trip
  assert.ok(domain.per_brand.razer, 'brand razer should exist');
  assert.equal(domain.per_brand.razer.attempts, 3);
  assert.equal(domain.per_brand.razer.fields_accepted_count, 5);
  assert.deepEqual(domain.per_brand.razer.recent_products, ['p1']);

  // WHY: Load order fixed — brands/paths loaded before rewards, so scope
  // assignment finds the target object. Previously a bug (rewards loaded first).
  assert.ok(domain.per_brand.razer.field_method_reward['dpi::extract'], 'brand reward should survive round-trip');

  // Path round-trip
  assert.ok(domain.per_path['/products'], 'path /products should exist');
  assert.equal(domain.per_path['/products'].attempts, 2);
  assert.equal(domain.per_path['/products'].fields_accepted_count, 3);
  assert.deepEqual(domain.per_path['/products'].recent_products, ['p2']);

  // WHY: Same load-order fix — path rewards now survive round-trip.
  assert.ok(domain.per_path['/products'].field_method_reward['weight::extract'], 'path reward should survive round-trip');

  specDb.db.close();
});

test('loadSourceIntelDomains returns null for empty category', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'empty' });
  const result = specDb.loadSourceIntelDomains('empty');
  assert.equal(result, null);
  specDb.db.close();
});
