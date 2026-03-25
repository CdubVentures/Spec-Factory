import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateIdentityGate } from '../identityGate.js';
import { makeAcceptedSource } from './helpers/identityGateRelaxedHarness.js';

test('noisy accepted-source fields do not block validation when identity evidence is otherwise sufficient', () => {
  const gate = evaluateIdentityGate([
    makeAcceptedSource({
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      rootDomain: 'razer.com',
      tier: 1,
      role: 'manufacturer',
      fieldCandidates: [
        { field: 'sensor', value: 'ProSettings' },
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
      url: 'https://psamethodcalculator.com/mouse/razer-viper-v3-pro',
      rootDomain: 'psamethodcalculator.com',
      tier: 2,
      role: 'database',
      fieldCandidates: [
        { field: 'sensor', value: 'Focus Pro 35K Optical Gen-2' },
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
        { field: 'sensor', value: 'Optical' },
        { field: 'lngth', value: '1271' },
        { field: 'width', value: '640' },
        { field: 'height', value: '360' }
      ]
    })
  ]);

  assert.equal(gate.validated, true);
  assert.equal(gate.status, 'CONFIRMED');
  assert.equal(gate.reasonCodes.includes('identity_conflict'), false);
});
