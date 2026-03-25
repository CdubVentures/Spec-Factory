import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIdentityCriticalContradictions } from '../identityGate.js';
import { makeAcceptedSource } from './helpers/identityGateRelaxedHarness.js';

test('sensor-family contradiction detection ignores equivalent labels and noisy blurbs', () => {
  const cases = [
    {
      label: 'Focus Pro 30K wording variants',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 30K' }]
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2,
          fieldCandidates: [{ field: 'sensor', value: 'FOCUS PRO 30K Optical' }]
        })
      ]
    },
    {
      label: 'generic and noisy sensor labels',
      sources: [
        makeAcceptedSource({
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'sensor', value: 'ProSettings' }]
        }),
        makeAcceptedSource({
          url: 'https://mousespecs.org/razer-viper-v3-pro',
          rootDomain: 'mousespecs.org',
          tier: 2,
          role: 'database',
          fieldCandidates: [{ field: 'sensor', value: 'Optical' }]
        }),
        makeAcceptedSource({
          url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
          rootDomain: 'psamethodcalculator.com',
          tier: 2,
          role: 'database',
          fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Gen-2' }]
        })
      ]
    },
    {
      label: 'Focus Pro 35K wording variants',
      sources: [
        makeAcceptedSource({
          url: 'https://mousespecs.org/razer-viper-v3-pro',
          rootDomain: 'mousespecs.org',
          tier: 2,
          role: 'database',
          fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Perfect Sensor' }]
        }),
        makeAcceptedSource({
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Sensor Gen-2' }]
        })
      ]
    },
    {
      label: 'localized manufacturer strings',
      sources: [
        makeAcceptedSource({
          url: 'https://www.razer.com/jp-jp/gaming-mice/razer-viper-v3-pro',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'sensor', value: '\u7b2c 2 \u4e16\u4ee3 Focus Pro 35K \u30aa\u30d7\u30c6\u30a3\u30ab\u30eb\u30bb\u30f3\u30b5\u30fc' }]
        }),
        makeAcceptedSource({
          url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
          rootDomain: 'psamethodcalculator.com',
          tier: 2,
          role: 'database',
          fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Sensor Gen-2' }]
        })
      ]
    },
    {
      label: 'truncated numeric blurbs',
      sources: [
        makeAcceptedSource({
          url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
          rootDomain: 'psamethodcalculator.com',
          tier: 2,
          role: 'database',
          fieldCandidates: [{ field: 'sensor', value: 'supporting up to 35' }]
        }),
        makeAcceptedSource({
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer',
          fieldCandidates: [{ field: 'sensor', value: 'Focus Pro 35K Optical Sensor Gen-2' }]
        })
      ]
    }
  ];

  for (const testCase of cases) {
    const contradictions = buildIdentityCriticalContradictions(testCase.sources);
    const sensorConflicts = contradictions.filter((entry) => entry.conflict === 'sensor_family_conflict');
    assert.equal(sensorConflicts.length, 0, `${testCase.label} should not create a sensor-family conflict`);
  }
});
