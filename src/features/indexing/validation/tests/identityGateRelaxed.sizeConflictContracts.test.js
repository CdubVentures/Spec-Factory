import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIdentityCriticalContradictions } from '../identityGate.js';
import { makeAcceptedSource } from './helpers/identityGateRelaxedHarness.js';

test('size-class contradiction detection honors tolerance bands for real dimensions', () => {
  const cases = [
    {
      label: 'sub-millimeter variance',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'lngth', value: '125.6' }]
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2,
          fieldCandidates: [{ field: 'lngth', value: '126.1' }]
        })
      ],
      expectedConflicts: 0
    },
    {
      label: 'measurement-tolerance variance',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'lngth', value: '125' }]
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2,
          fieldCandidates: [{ field: 'lngth', value: '132' }]
        })
      ],
      expectedConflicts: 0
    },
    {
      label: 'product-class mismatch',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'lngth', value: '90' }]
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2,
          fieldCandidates: [{ field: 'lngth', value: '130' }]
        })
      ],
      expectedConflicts: 1
    }
  ];

  for (const testCase of cases) {
    const contradictions = buildIdentityCriticalContradictions(testCase.sources);
    const sizeConflicts = contradictions.filter((entry) => entry.conflict === 'size_class_conflict');
    assert.equal(
      sizeConflicts.length,
      testCase.expectedConflicts,
      `${testCase.label} should yield ${testCase.expectedConflicts} size conflict(s)`
    );
  }
});

test('implausible page-layout dimensions do not create a size conflict when one plausible mouse cluster exists', () => {
  const contradictions = buildIdentityCriticalContradictions([
    makeAcceptedSource({
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      rootDomain: 'razer.com',
      tier: 1,
      role: 'manufacturer',
      fieldCandidates: [
        { field: 'width', value: '375' },
        { field: 'height', value: '620' }
      ]
    }),
    makeAcceptedSource({
      url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
      rootDomain: 'rtings.com',
      tier: 2,
      role: 'lab',
      fieldCandidates: [
        { field: 'width', value: '300' },
        { field: 'height', value: '150' }
      ]
    }),
    makeAcceptedSource({
      url: 'https://prosettings.net/blog/the-rise-of-the-razer-viper-v3-pro',
      rootDomain: 'prosettings.net',
      tier: 2,
      role: 'review',
      fieldCandidates: [
        { field: 'width', value: '1600' },
        { field: 'height', value: '900' }
      ]
    }),
    makeAcceptedSource({
      url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
      rootDomain: 'psamethodcalculator.com',
      tier: 2,
      role: 'database',
      fieldCandidates: [
        { field: 'lngth', value: '127.1' },
        { field: 'width', value: '63.9' },
        { field: 'height', value: '39.9' }
      ]
    }),
    makeAcceptedSource({
      url: 'https://mousespecs.org/razer-viper-v3-pro',
      rootDomain: 'mousespecs.org',
      tier: 2,
      role: 'database',
      fieldCandidates: [
        { field: 'lngth', value: '1271' },
        { field: 'width', value: '640' },
        { field: 'height', value: '360' }
      ]
    })
  ]);

  const sizeConflicts = contradictions.filter((entry) => entry.conflict === 'size_class_conflict');
  assert.equal(sizeConflicts.length, 0);
});
