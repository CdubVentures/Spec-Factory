/**
 * Tests for consensus engine label-based inclusion (KP1 refactor).
 *
 * After refactor:
 * - matched + possible sources participate in consensus
 * - different + unknown sources are preserved but do NOT vote
 * - anchor-conflict sources are excluded entirely
 * - identity_label is attached to source records
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runConsensusEngine } from '../src/scoring/consensusEngine.js';

function makeSource({ host, value, field = 'sensor', identityMatch = true, identityScore = 0.9, criticalConflicts = [], majorConflicts = [] }) {
  return {
    host,
    rootDomain: host,
    tier: 2,
    tierName: 'database',
    role: 'review',
    approvedDomain: true,
    identity: { match: identityMatch, score: identityScore, criticalConflicts },
    anchorCheck: { majorConflicts },
    fieldCandidates: [
      { field, value, method: 'html_table', keyPath: `payload.${field}`, confidence: 0.85 }
    ]
  };
}

const fieldOrder = ['id', 'brand', 'model', 'base_model', 'category', 'sku', 'sensor'];
const identityLock = { brand: 'Razer', model: 'Viper V3 Pro' };
const categoryConfig = { criticalFieldSet: new Set() };

test('label-based: matched sources participate in consensus', () => {
  const result = runConsensusEngine({
    sourceResults: [
      makeSource({ host: 'a.com', value: 'PAW3950', identityMatch: true, identityScore: 0.95 }),
      makeSource({ host: 'b.com', value: 'PAW3950', identityMatch: true, identityScore: 0.90 }),
    ],
    categoryConfig,
    fieldOrder,
    anchors: {},
    identityLock,
    productId: 'mouse-test',
    category: 'mouse',
  });

  assert.equal(result.fields.sensor, 'PAW3950');
});

test('label-based: possible sources (score >= 0.4, not matched, no conflicts) participate in consensus', () => {
  const result = runConsensusEngine({
    sourceResults: [
      makeSource({ host: 'a.com', value: 'PAW3950', identityMatch: false, identityScore: 0.5 }),
      makeSource({ host: 'b.com', value: 'PAW3950', identityMatch: false, identityScore: 0.45 }),
    ],
    categoryConfig,
    fieldOrder,
    anchors: {},
    identityLock,
    productId: 'mouse-test',
    category: 'mouse',
  });

  assert.equal(result.fields.sensor, 'PAW3950', 'possible sources should contribute to consensus');
});

test('label-based: different sources (low score) do NOT vote', () => {
  const result = runConsensusEngine({
    sourceResults: [
      makeSource({ host: 'a.com', value: 'WRONG_SENSOR', identityMatch: false, identityScore: 0.2 }),
      makeSource({ host: 'b.com', value: 'WRONG_SENSOR', identityMatch: false, identityScore: 0.1 }),
    ],
    categoryConfig,
    fieldOrder,
    anchors: {},
    identityLock,
    productId: 'mouse-test',
    category: 'mouse',
  });

  assert.equal(result.fields.sensor, 'unk', 'different sources should not produce consensus');
});

test('label-based: different sources with criticalConflicts do NOT vote', () => {
  const result = runConsensusEngine({
    sourceResults: [
      makeSource({ host: 'a.com', value: 'HERO', identityMatch: false, identityScore: 0.8, criticalConflicts: ['brand_mismatch'] }),
      makeSource({ host: 'b.com', value: 'HERO', identityMatch: false, identityScore: 0.7, criticalConflicts: ['brand_mismatch'] }),
    ],
    categoryConfig,
    fieldOrder,
    anchors: {},
    identityLock,
    productId: 'mouse-test',
    category: 'mouse',
  });

  assert.equal(result.fields.sensor, 'unk', 'sources with criticalConflicts labeled different should not vote');
});

test('label-based: anchor-conflict sources excluded entirely', () => {
  const result = runConsensusEngine({
    sourceResults: [
      makeSource({ host: 'a.com', value: 'PAW3950', identityMatch: true, majorConflicts: ['brand'] }),
      makeSource({ host: 'b.com', value: 'PAW3950', identityMatch: true }),
      makeSource({ host: 'c.com', value: 'PAW3950', identityMatch: true }),
    ],
    categoryConfig,
    fieldOrder,
    anchors: {},
    identityLock,
    productId: 'mouse-test',
    category: 'mouse',
  });

  assert.equal(result.fields.sensor, 'PAW3950');
});

test('label-based: unknown identity (null) sources do NOT vote', () => {
  const sources = [
    {
      host: 'a.com',
      rootDomain: 'a.com',
      tier: 2,
      tierName: 'database',
      role: 'review',
      approvedDomain: true,
      identity: null,
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: [
        { field: 'sensor', value: 'PAW3950', method: 'html_table', confidence: 0.85 }
      ]
    },
    {
      host: 'b.com',
      rootDomain: 'b.com',
      tier: 2,
      tierName: 'database',
      role: 'review',
      approvedDomain: true,
      identity: null,
      anchorCheck: { majorConflicts: [] },
      fieldCandidates: [
        { field: 'sensor', value: 'PAW3950', method: 'html_table', confidence: 0.85 }
      ]
    },
  ];

  const result = runConsensusEngine({
    sourceResults: sources,
    categoryConfig,
    fieldOrder,
    anchors: {},
    identityLock,
    productId: 'mouse-test',
    category: 'mouse',
  });

  assert.equal(result.fields.sensor, 'unk', 'unknown identity sources should not produce consensus');
});
