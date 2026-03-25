import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIdentityCriticalContradictions } from '../identityGate.js';
import { makeAcceptedSource } from './helpers/identityGateRelaxedHarness.js';

test('sku contradiction detection distinguishes regional variants from different products', () => {
  const cases = [
    {
      label: 'regional SKU suffix variants',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          identityCandidates: { sku: 'RZ01-04630100-R3U1' }
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2,
          identityCandidates: { sku: 'RZ01-04630100-R3M1' }
        })
      ],
      expectedConflicts: 0
    },
    {
      label: 'completely different SKUs',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          identityCandidates: { sku: 'RZ01-04630100-R3U1' }
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2,
          identityCandidates: { sku: 'LOG-910-006787' }
        })
      ],
      expectedConflicts: 1
    }
  ];

  for (const testCase of cases) {
    const contradictions = buildIdentityCriticalContradictions(testCase.sources);
    const skuConflicts = contradictions.filter((entry) => entry.conflict === 'sku_conflict');
    assert.equal(
      skuConflicts.length,
      testCase.expectedConflicts,
      `${testCase.label} should yield ${testCase.expectedConflicts} sku conflict(s)`
    );
  }
});
