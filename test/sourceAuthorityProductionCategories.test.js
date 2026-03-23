import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deriveApprovedFromSources } from '../src/features/indexing/sources/sourceFileService.js';
import {
  loadSourceRegistry,
  registrySparsityReport,
} from '../src/features/indexing/discovery/sourceRegistry.js';

// WHY: Manufacturer hosts are no longer static source entries — they are
// auto-promoted at runtime from brand resolver output. Static requiredHosts
// only cover labs, retailers, databases, and community sources.
const CATEGORY_EXPECTATIONS = {
  keyboard: {
    minRealCount: 20,
    requiredHosts: [
      'rtings.com',
      'techpowerup.com',
      'tomshardware.com',
      'lttlabs.com',
      'newegg.com',
      'bhphotovideo.com',
      'mechanicalkeyboards.com',
      'drop.com',
      'pcpartpicker.com',
      'versus.com',
      'reddit.com',
      'geekhack.org',
      'keebtalk.com',
      'theremingoat.com',
      'keybumps.com',
    ],
  },
  monitor: {
    minRealCount: 20,
    requiredHosts: [
      'rtings.com',
      'tftcentral.co.uk',
      'tomshardware.com',
      'pcmonitors.info',
      'displayninja.com',
      'lttlabs.com',
      'newegg.com',
      'bhphotovideo.com',
      'microcenter.com',
      'displayspecifications.com',
      'versus.com',
      'pcpartpicker.com',
      'reddit.com',
      'displaydb.com',
      'blurbusters.com',
      'panelook.com',
    ],
  },
  mouse: {
    minRealCount: 20,
    requiredHosts: [
      'rtings.com',
      'techpowerup.com',
      'tomshardware.com',
      'mousespecs.org',
      'sensor.fyi',
      'lttlabs.com',
      'prosettings.net',
      'amazon.com',
      'bestbuy.com',
      'newegg.com',
      'bhphotovideo.com',
      'microcenter.com',
      'pcpartpicker.com',
      'reddit.com',
      'eloshapes.com',
      'versus.com',
      'rocketjumpninja.com',
      'gaminggem.com',
    ],
  },
};

function loadCategoryRaw(category) {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'category_authority', category, 'sources.json'), 'utf8')
  );
}

function allKnownHosts(raw) {
  const hosts = new Set();
  for (const values of Object.values(raw.approved || {})) {
    for (const value of values || []) {
      hosts.add(String(value || '').trim().toLowerCase().replace(/^www\./, ''));
    }
  }
  for (const entry of Object.values(raw.sources || {})) {
    const baseUrl = String(entry?.base_url || '').trim();
    if (!baseUrl) continue;
    hosts.add(new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase());
  }
  return [...hosts];
}

for (const [category, expectation] of Object.entries(CATEGORY_EXPECTATIONS)) {
  test(`${category} sources.json is normalized to detailed sources and curated host coverage`, () => {
    const raw = loadCategoryRaw(category);
    const derivedApproved = deriveApprovedFromSources(raw.sources || {});
    const { registry, validationErrors } = loadSourceRegistry(category, raw);
    const report = registrySparsityReport(registry);
    const hosts = new Set(allKnownHosts(raw));
    const staticManufacturerEntries = Object.values(raw.sources || {}).filter((entry) => (
      entry?.tier === 'tier1_manufacturer'
    ));

    // WHY: manufacturer hosts are curated in approved.manufacturer separately
    // from detailed sources — only non-manufacturer roles must match derived.
    const { manufacturer: _m, ...approvedWithoutMfr } = raw.approved;
    const { manufacturer: _d, ...derivedWithoutMfr } = derivedApproved;
    assert.deepEqual(
      approvedWithoutMfr,
      derivedWithoutMfr,
      `${category} non-manufacturer approved block must be derived from detailed sources`
    );
    assert.deepEqual(validationErrors, [], `${category} validation errors: ${validationErrors.join('; ')}`);
    // WHY: manufacturer hosts in approved.manufacturer are intentionally synthetic
    // (no detailed source entry) — only non-manufacturer synthetics should be 0.
    const nonMfrSynthetics = registry.entries.filter(e => e.synthetic && e.tier !== 'tier1_manufacturer').length;
    assert.equal(nonMfrSynthetics, 0, `${category} should have 0 non-manufacturer synthetic entries`);
    assert.equal(report.real_count >= expectation.minRealCount, true, `${category} should have >= ${expectation.minRealCount} real entries`);
    assert.deepEqual(staticManufacturerEntries, [], `${category} should not ship static tier1 manufacturer entries`);

    for (const host of hosts) {
      assert.notEqual(host, 'example.com', `${category} must not ship placeholder host ${host}`);
      assert.notEqual(host, 'localhost', `${category} must not ship placeholder host ${host}`);
      assert.notEqual(host, 'test.com', `${category} must not ship placeholder host ${host}`);
    }

    for (const host of expectation.requiredHosts) {
      assert.equal(hosts.has(host), true, `${category} missing curated host ${host}`);
      assert.ok(
        registry.entries.some((entry) => entry.host === host && entry.synthetic === false),
        `${category} missing detailed source entry for ${host}`
      );
    }
  });

  test(`${category} approved.manufacturer lists known brand domains`, () => {
    const raw = loadCategoryRaw(category);
    assert.ok(Array.isArray(raw.approved.manufacturer),
      `${category} approved.manufacturer should be an array`);
  });

}
