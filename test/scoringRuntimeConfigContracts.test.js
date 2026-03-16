import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateFieldValues } from '../src/scoring/fieldAggregator.js';
import { runConsensusEngine } from '../src/scoring/consensusEngine.js';

function makeAggregatedSource({
  host,
  field,
  value,
  method,
  tier = 2,
  role = 'review',
}) {
  return {
    url: `https://${host}/${field}`,
    host,
    rootDomain: host,
    tier,
    role,
    identity: { match: true },
    anchorCheck: { majorConflicts: [] },
    fieldCandidates: [
      {
        field,
        value,
        method,
        keyPath: `payload.${field}`,
      },
    ],
  };
}

function makeConsensusSource({
  host,
  field,
  value,
  method,
  approvedDomain = true,
  tier = 2,
  tierName = 'database',
  role = 'review',
}) {
  return {
    url: `https://${host}/${field}`,
    finalUrl: `https://${host}/${field}`,
    host,
    rootDomain: host,
    tier,
    tierName,
    role,
    approvedDomain,
    identity: { match: true },
    anchorCheck: { majorConflicts: [] },
    fieldCandidates: [
      {
        field,
        value,
        method,
        keyPath: `payload.${field}`,
      },
    ],
  };
}

const IDENTITY_LOCK = { brand: 'Logitech', model: 'G Pro X Superlight 2' };
const CONSENSUS_BASE = {
  categoryConfig: { criticalFieldSet: new Set() },
  anchors: {},
  identityLock: IDENTITY_LOCK,
  productId: 'mouse-test',
  category: 'mouse',
};

test('aggregateFieldValues honors parsingConfidenceBaseMap overrides for anchor-field selection', () => {
  const sourceResults = [
    makeAggregatedSource({
      host: 'network.example',
      field: 'shape',
      value: 'ergonomic',
      method: 'network_json',
    }),
    makeAggregatedSource({
      host: 'embedded.example',
      field: 'shape',
      value: 'symmetrical',
      method: 'embedded_state',
    }),
  ];

  const defaultResult = aggregateFieldValues(sourceResults, IDENTITY_LOCK, 'mouse-test');
  assert.equal(defaultResult.fields.shape, 'ergonomic');

  const overriddenResult = aggregateFieldValues(sourceResults, IDENTITY_LOCK, 'mouse-test', {
    parsingConfidenceBaseMap: {
      network_json: 0.1,
      embedded_state: 1.5,
    },
  });
  assert.equal(overriddenResult.fields.shape, 'symmetrical');
});

test('runConsensusEngine honors strict-acceptance and pass-target overrides for non-identity fields', () => {
  const sourceResults = [
    makeConsensusSource({
      host: 'spec.example',
      field: 'connectivity',
      value: 'wireless',
      method: 'network_json',
    }),
  ];

  const defaultResult = runConsensusEngine({
    ...CONSENSUS_BASE,
    fieldOrder: ['id', 'brand', 'model', 'base_model', 'category', 'sku', 'connectivity'],
    sourceResults,
  });
  assert.equal(defaultResult.fields.connectivity, 'unk');
  assert.equal(defaultResult.provenance.connectivity.pass_target, 2);

  const overriddenResult = runConsensusEngine({
    ...CONSENSUS_BASE,
    fieldOrder: ['id', 'brand', 'model', 'base_model', 'category', 'sku', 'connectivity'],
    sourceResults,
    config: {
      consensusStrictAcceptanceDomainCount: 1,
      consensusPassTargetNormal: 1,
    },
  });
  assert.equal(overriddenResult.fields.connectivity, 'wireless');
  assert.equal(overriddenResult.provenance.connectivity.pass_target, 1);
});

test('runConsensusEngine honors consensus method-weight overrides when ranking tied domain counts', () => {
  const sourceResults = [
    makeConsensusSource({
      host: 'network-a.example',
      field: 'connection',
      value: 'wired',
      method: 'network_json',
    }),
    makeConsensusSource({
      host: 'network-b.example',
      field: 'connection',
      value: 'wired',
      method: 'network_json',
    }),
    makeConsensusSource({
      host: 'adapter-a.example',
      field: 'connection',
      value: 'wireless',
      method: 'dom',
    }),
    makeConsensusSource({
      host: 'adapter-b.example',
      field: 'connection',
      value: 'wireless',
      method: 'dom',
    }),
  ];

  const defaultResult = runConsensusEngine({
    ...CONSENSUS_BASE,
    fieldOrder: ['id', 'brand', 'model', 'base_model', 'category', 'sku', 'connection'],
    sourceResults,
  });
  assert.equal(defaultResult.fields.connection, 'wired');

  const overriddenResult = runConsensusEngine({
    ...CONSENSUS_BASE,
    fieldOrder: ['id', 'brand', 'model', 'base_model', 'category', 'sku', 'connection'],
    sourceResults,
    config: { consensusMethodWeightNetworkJson: 0.1 },
  });
  assert.equal(overriddenResult.fields.connection, 'wireless');
});
