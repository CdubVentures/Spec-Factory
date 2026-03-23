import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildHostPolicy,
  resolveHostPolicies,
} from '../src/features/indexing/discovery/hostPolicy.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';

function buildMouseRegistry() {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'category_authority', 'mouse', 'sources.json'), 'utf8')
  );
  return loadSourceRegistry('mouse', raw).registry;
}

function findEntry(registry, host) {
  return registry.entries.find(e => e.host === host);
}

describe('hostPolicy', () => {
  it('Tier2 lab + SearXNG → site supported', () => {
    const reg = buildMouseRegistry();
    const entry = findEntry(reg, 'rtings.com');
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.operator_support.site, true);
    assert.equal(policy.tier, 'tier2_lab');
    assert.equal(policy.tier_numeric, 2);
    assert.equal(policy.host, 'rtings.com');
  });

  it('any host + SearXNG → site supported', () => {
    const reg = buildMouseRegistry();
    const entry = findEntry(reg, 'rtings.com');
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.operator_support.site, true);
    assert.equal(policy.operator_support.filetype, false);
  });

  it('connector_only propagation', () => {
    const fakeEntry = {
      host: 'fake.com',
      tier: 'tier3_retailer',
      authority: 'unknown',
      synthetic: false,
      crawl_config: null,
      requires_js: false,
      connector_only: true,
      blocked_in_search: false,
      content_types: [],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(fakeEntry, 'searxng');
    assert.equal(policy.connector_only, true);
  });

  it('health is null in Phase 1', () => {
    const reg = buildMouseRegistry();
    const entry = findEntry(reg, 'rtings.com');
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.health, null);
  });

  it('health structural shape accepted when provided', () => {
    const entryWithHealth = {
      host: 'test.com',
      tier: 'tier2_lab',
      authority: 'instrumented',
      synthetic: false,
      crawl_config: null,
      requires_js: false,
      connector_only: false,
      blocked_in_search: false,
      content_types: [],
      field_coverage: null,
      health: {
        last_success_at: '2026-03-01T00:00:00Z',
        last_failure_at: null,
        success_rate_7d: 0.95,
        avg_latency_ms: 200,
        block_rate_7d: 0.01,
      },
    };
    const policy = buildHostPolicy(entryWithHealth, 'google');
    assert.ok(policy.health);
    assert.equal(policy.health.success_rate_7d, 0.95);
  });

  it('requires_js propagation', () => {
    const reg = buildMouseRegistry();
    const entry = findEntry(reg, 'rtings.com');
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.requires_js, true); // rtings uses playwright
  });

  it('synthetic entry → synthetic=true in policy', () => {
    // newegg.com was promoted to a full source entry; use a direct synthetic entry
    const syntheticEntry = {
      host: 'synth-test.example.com',
      tier: 'tier3_retailer',
      authority: 'unknown',
      synthetic: true,
      crawl_config: null,
      requires_js: false,
      connector_only: false,
      blocked_in_search: false,
      content_types: [],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(syntheticEntry, 'searxng');
    assert.equal(policy.synthetic, true);
  });

  it('resolveHostPolicies produces map for all registry entries', () => {
    const reg = buildMouseRegistry();
    const map = resolveHostPolicies(reg, 'searxng');
    assert.ok(map instanceof Map);
    assert.ok(map.size > 0);
    assert.equal(map.size, reg.entries.length);
    // Every entry should have a policy
    for (const entry of reg.entries) {
      assert.ok(map.has(entry.host), `missing policy for ${entry.host}`);
    }
  });

  it('registrableDomain populated from hostParser', () => {
    const reg = buildMouseRegistry();
    const entry = findEntry(reg, 'rtings.com');
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.registrable_domain, 'rtings.com');
  });
});
