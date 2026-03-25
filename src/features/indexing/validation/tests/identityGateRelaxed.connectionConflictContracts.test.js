import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIdentityCriticalContradictions } from '../identityGate.js';
import { makeAcceptedSource } from './helpers/identityGateRelaxedHarness.js';

test('wireless and dual-mode connection labels do not create a connection-class conflict', () => {
  const contradictions = buildIdentityCriticalContradictions([
    makeAcceptedSource({
      url: 'https://razer.com/mice',
      rootDomain: 'razer.com',
      tier: 1,
      role: 'manufacturer',
      fieldCandidates: [{ field: 'connection', value: 'wireless' }]
    }),
    makeAcceptedSource({
      url: 'https://rtings.com/review',
      rootDomain: 'rtings.com',
      tier: 2,
      fieldCandidates: [{ field: 'connection', value: 'wireless / wired' }]
    })
  ]);

  const connectionConflicts = contradictions.filter((entry) => entry.conflict === 'connection_class_conflict');
  assert.equal(connectionConflicts.length, 0);
});
