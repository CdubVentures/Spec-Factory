import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvedDomainsFromSources,
  createCategoryAuthorityHarness,
  mapSourcesByHost,
} from '../../_tests/helpers/categoryAuthorityContractHarness.js';

const CATEGORY = 'mouse';
const harness = createCategoryAuthorityHarness({ category: CATEGORY, importMetaUrl: import.meta.url });

test('mouse search hints use approved real hostnames instead of tier tokens', async () => {
  const [full, sources] = await Promise.all([
    harness.readCategoryJson('_generated', 'field_rules.json'),
    harness.readCategoryJson('sources.json'),
  ]);
  const approvedDomains = approvedDomainsFromSources(sources);
  const forbiddenTokens = new Set(['manufacturer', 'lab', 'retailer', 'database', 'community', 'support', 'manual', 'pdf']);

  for (const [fieldKey, field] of Object.entries(full.fields || {})) {
    const domainHints = field?.search_hints?.domain_hints || [];
    const dottedDomainHints = domainHints.filter((value) => String(value || '').trim().toLowerCase().includes('.'));
    assert.equal(field?.search_hints?.query_terms?.length > 0, true, `query_terms missing for ${fieldKey}`);
    if (dottedDomainHints.length === 0) {
      continue;
    }
    for (const domainHint of dottedDomainHints) {
      const normalized = String(domainHint || '').trim().toLowerCase();
      assert.equal(normalized.includes('.'), true, `Non-domain hint for ${fieldKey}: ${domainHint}`);
      assert.equal(forbiddenTokens.has(normalized), false, `Tier token leaked into ${fieldKey}: ${domainHint}`);
      assert.equal(approvedDomains.has(normalized), true, `Unapproved domain for ${fieldKey}: ${domainHint}`);
    }
  }
});

test('mouse depth sources are explicit and outrank retailers in discovery priority', async () => {
  const sources = await harness.readCategoryJson('sources.json');
  const byHost = mapSourcesByHost(sources);
  const retailerPriority = Math.max(
    ...Object.values(sources.sources || {})
      .filter((source) => source?.tier === 'tier3_retailer')
      .map((source) => Number(source?.discovery?.priority || 0))
  );

  const expectedDepthHosts = [
    'rtings.com',
    'eloshapes.com',
    'techpowerup.com',
    'mousespecs.org',
    'sensor.fyi',
    'lttlabs.com',
  ];

  for (const host of expectedDepthHosts) {
    const entry = byHost.get(host);
    assert.ok(entry, `Missing explicit depth source for ${host}`);
    assert.equal(entry.source.discovery.enabled, true, `${host} should be discovery-enabled`);
    assert.ok(
      Number(entry.source.discovery.priority || 0) > retailerPriority,
      `${host} should outrank all retailer priorities`
    );
  }
});

test('mouse specialist sources advertise the hard fields they are meant to unlock', async () => {
  const sources = await harness.readCategoryJson('sources.json');
  const byHost = mapSourcesByHost(sources);

  assert.deepEqual(
    byHost.get('rtings.com')?.source.field_coverage?.high?.slice(0, 2),
    ['click_latency', 'sensor_latency'],
    'rtings high coverage should start with latency fields'
  );

  const eloHigh = new Set(byHost.get('eloshapes.com')?.source.field_coverage?.high || []);
  for (const field of ['shape', 'lngth', 'width', 'height', 'weight']) {
    assert.equal(eloHigh.has(field), true, `eloshapes should cover ${field}`);
  }

  const tpuHigh = new Set(byHost.get('techpowerup.com')?.source.field_coverage?.high || []);
  for (const field of ['sensor', 'lift', 'motion_sync', 'encoder', 'switch']) {
    assert.equal(tpuHigh.has(field), true, `techpowerup should cover ${field}`);
  }

  const mouseSpecsHigh = new Set(byHost.get('mousespecs.org')?.source.field_coverage?.high || []);
  for (const field of ['shape', 'weight', 'battery_hours', 'switch', 'encoder']) {
    assert.equal(mouseSpecsHigh.has(field), true, `mousespecs should cover ${field}`);
  }

  const sensorFyiHigh = new Set(byHost.get('sensor.fyi')?.source.field_coverage?.high || []);
  for (const field of ['sensor', 'sensor_brand', 'sensor_link', 'ips', 'acceleration']) {
    assert.equal(sensorFyiHigh.has(field), true, `sensor.fyi should cover ${field}`);
  }
});
