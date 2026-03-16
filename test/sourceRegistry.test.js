import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadSourceRegistry,
  lookupSource,
  listSourcesByTier,
  fieldCoverageForHost,
  isConnectorOnly,
  isBlockedInSearch,
  registrySparsityReport,
  sourceEntrySchema,
  TIER_ENUM,
} from '../src/features/indexing/discovery/sourceRegistry.js';

function loadMouseRaw() {
  const raw = readFileSync(
    join(process.cwd(), 'category_authority', 'mouse', 'sources.json'),
    'utf8'
  );
  return JSON.parse(raw);
}

describe('sourceRegistry', () => {
  it('parses real mouse sources.json with 0 validation errors for detailed entries', () => {
    const raw = loadMouseRaw();
    const { registry, validationErrors } = loadSourceRegistry('mouse', raw);
    assert.equal(validationErrors.length, 0, `unexpected errors: ${JSON.stringify(validationErrors)}`);
    assert.ok(registry.entries.length > 0);
    assert.equal(registry.category, 'mouse');
    assert.ok(typeof registry.version === 'string');
    assert.ok(typeof registry.generated_at === 'string');
  });

  it('mouse has no approved-only synthetic entries after source curation', () => {
    const raw = loadMouseRaw();
    const { registry, sparsityWarnings } = loadSourceRegistry('mouse', raw);
    const syntheticHosts = registry.entries.filter((entry) => entry.synthetic).map((entry) => entry.host);
    assert.deepEqual(syntheticHosts, [], `mouse should not rely on synthetic entries: ${syntheticHosts.join(', ')}`);
    assert.deepEqual(sparsityWarnings, [], `mouse should not emit sparsity warnings: ${JSON.stringify(sparsityWarnings)}`);
  });

  it('sparsity report reflects a fully detailed mouse registry', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    const report = registrySparsityReport(registry);
    assert.ok(report.total > 0);
    assert.ok(report.real_count > 0);
    assert.equal(report.synthetic_count, 0);
    assert.equal(report.total, report.real_count + report.synthetic_count);
    assert.equal(report.synthetic_ratio, 0);
    assert.ok(Array.isArray(report.detailed));
  });

  it('lookupSource by exact host', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    const entry = lookupSource(registry, 'rtings.com');
    assert.ok(entry);
    assert.equal(entry.host, 'rtings.com');
    assert.equal(entry.tier, 'tier2_lab');
  });

  it('lookupSource by subdomain', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    const entry = lookupSource(registry, 'www.rtings.com');
    assert.ok(entry, 'subdomain lookup should match parent host');
    assert.equal(entry.host, 'rtings.com');
  });

  it('lookupSource returns null for miss', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    assert.equal(lookupSource(registry, 'unknown-site.xyz'), null);
  });

  it('listSourcesByTier filters correctly', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    const t2 = listSourcesByTier(registry, 'tier2_lab');
    assert.ok(t2.length >= 2, `expected >= 2 labs, got ${t2.length}`);
    assert.ok(t2.every(e => e.tier === 'tier2_lab'));
  });

  it('fieldCoverageForHost returns coverage or null', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    const cov = fieldCoverageForHost(registry, 'rtings.com');
    assert.ok(cov);
    assert.ok(Array.isArray(cov.high));

    const techCov = fieldCoverageForHost(registry, 'techpowerup.com');
    assert.ok(techCov, 'techpowerup.com should have field_coverage');

    const noCov = fieldCoverageForHost(registry, 'unknown-host.xyz');
    assert.equal(noCov, null);
  });

  it('connector_only and blocked_in_search flags default to false', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    assert.equal(isConnectorOnly(registry, 'rtings.com'), false);
    assert.equal(isBlockedInSearch(registry, 'rtings.com'), false);
  });

  it('empty sources produces empty registry, no crash', () => {
    const { registry, validationErrors } = loadSourceRegistry('test', {
      category: 'test',
      approved: {},
      denylist: [],
      sources: {},
    });
    assert.equal(registry.entries.length, 0);
    assert.equal(validationErrors.length, 0);
  });

  it('missing required tier in source entry produces validation error', () => {
    const { validationErrors } = loadSourceRegistry('test', {
      category: 'test',
      approved: {},
      denylist: [],
      sources: {
        bad_source: {
          display_name: 'Bad',
          // missing tier
          base_url: 'https://bad.com',
        },
      },
    });
    assert.ok(validationErrors.length > 0, 'should have validation error for missing tier');
  });

  it('TIER_ENUM contains all 5 tiers', () => {
    assert.ok(TIER_ENUM.includes('tier1_manufacturer'));
    assert.ok(TIER_ENUM.includes('tier2_lab'));
    assert.ok(TIER_ENUM.includes('tier3_retailer'));
    assert.ok(TIER_ENUM.includes('tier4_community'));
    assert.ok(TIER_ENUM.includes('tier5_aggregator'));
  });

  it('generated_at and version present on output', () => {
    const raw = loadMouseRaw();
    const { registry } = loadSourceRegistry('mouse', raw);
    assert.ok(registry.generated_at);
    assert.ok(registry.version);
    // ISO 8601 check
    assert.ok(!isNaN(Date.parse(registry.generated_at)));
  });
});
