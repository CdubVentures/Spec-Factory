import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../runtimeOpsDataBuilders.js';
import { makeEvent, makeMeta } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildPreFetchPhases: brand_resolved projects status families into brand_resolution', () => {
  const cases = [
    {
      name: 'skipped',
      payload: {
        brand: '',
        status: 'skipped',
        skip_reason: 'no_brand_in_identity_lock',
        official_domain: '',
        aliases: [],
        support_domain: '',
        confidence: 0,
      },
      expected: {
        brand: '',
        status: 'skipped',
        skip_reason: 'no_brand_in_identity_lock',
        official_domain: '',
        aliases: [],
        support_domain: '',
        confidence: 0,
      },
    },
    {
      name: 'failed',
      payload: {
        brand: 'Razer',
        status: 'failed',
        skip_reason: 'LLM call timed out',
        official_domain: '',
        aliases: [],
        support_domain: '',
        confidence: 0,
      },
      expected: {
        brand: 'Razer',
        status: 'failed',
        skip_reason: 'LLM call timed out',
        official_domain: '',
        aliases: [],
        support_domain: '',
        confidence: 0,
      },
    },
    {
      name: 'resolved',
      payload: {
        brand: 'Razer',
        status: 'resolved',
        skip_reason: '',
        official_domain: 'razer.com',
        aliases: ['Razer Inc'],
        support_domain: 'support.razer.com',
        confidence: 0.95,
      },
      expected: {
        brand: 'Razer',
        status: 'resolved',
        skip_reason: '',
        official_domain: 'razer.com',
        aliases: ['Razer Inc'],
        support_domain: 'support.razer.com',
        confidence: 0.95,
      },
    },
  ];

  for (const { name, payload, expected } of cases) {
    const result = buildPreFetchPhases([makeEvent('brand_resolved', payload)], makeMeta(), {});

    assert.equal(result.brand_resolution?.status, expected.status, `${name}: status`);
    assert.equal(result.brand_resolution?.skip_reason, expected.skip_reason, `${name}: skip_reason`);
    assert.equal(result.brand_resolution?.brand, expected.brand, `${name}: brand`);
    assert.equal(result.brand_resolution?.official_domain, expected.official_domain, `${name}: official_domain`);
    assert.deepEqual(result.brand_resolution?.aliases, expected.aliases, `${name}: aliases`);
    assert.equal(result.brand_resolution?.support_domain, expected.support_domain, `${name}: support_domain`);
    assert.equal(result.brand_resolution?.confidence, expected.confidence, `${name}: confidence`);
  }
});

test('buildPreFetchPhases: brand_resolution preserves reasoning and defaults missing optional fields', () => {
  const result = buildPreFetchPhases([
    makeEvent('brand_resolved', {
      brand: 'Razer',
      official_domain: 'razer.com',
      reasoning: [
        'LLM identified razer.com as the official manufacturer domain',
        'Alias "Razer Inc" confirmed via corporate filings',
      ],
    }),
  ], makeMeta(), {});

  assert.deepEqual(result.brand_resolution, {
    brand: 'Razer',
    status: 'resolved',
    skip_reason: '',
    official_domain: 'razer.com',
    aliases: [],
    support_domain: '',
    confidence: null,
    reasoning: [
      'LLM identified razer.com as the official manufacturer domain',
      'Alias "Razer Inc" confirmed via corporate filings',
    ],
  });
});

test('buildPreFetchPhases: brand_resolution falls back to artifacts when events are absent', () => {
  const result = buildPreFetchPhases([], makeMeta(), {
    brand_resolution: {
      brand: 'Cooler Master',
      status: 'resolved',
      skip_reason: '',
      official_domain: 'coolermaster.com',
      aliases: [],
      support_domain: '',
      confidence: 0.8,
    },
  });

  assert.deepEqual(result.brand_resolution, {
    brand: 'Cooler Master',
    status: 'resolved',
    skip_reason: '',
    official_domain: 'coolermaster.com',
    aliases: [],
    support_domain: '',
    confidence: 0.8,
    reasoning: [],
  });
});
