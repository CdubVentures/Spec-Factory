import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizationMetricsContext } from '../src/features/indexing/orchestration/index.js';

test('buildFinalizationMetricsContext computes parser health averages, fingerprint cardinality, and contribution payload', () => {
  const calls = {
    collectContribution: 0,
  };
  const contributionResult = {
    llmFields: ['weight_g'],
    extractionFields: ['battery_life'],
  };

  const result = buildFinalizationMetricsContext({
    sourceResults: [
      {
        parserHealth: { health_score: 0.9, parser: 'a' },
        fingerprint: { id: 'fp-1' },
      },
      {
        parserHealth: { health_score: 0.6, parser: 'b' },
        fingerprint: { id: 'fp-2' },
      },
      {
        parserHealth: { parser: 'c' },
        fingerprint: { id: 'fp-1' },
      },
      {
        parserHealth: null,
        fingerprint: { id: '' },
      },
    ],
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: 54 } },
    provenance: { weight_g: { source: 'a' } },
    collectContributionFieldsFn: (args) => {
      calls.collectContribution += 1;
      assert.equal(args.fieldOrder[0], 'weight_g');
      assert.equal(args.normalized.fields.weight_g, 54);
      assert.equal(args.provenance.weight_g.source, 'a');
      return contributionResult;
    },
  });

  assert.equal(calls.collectContribution, 1);
  assert.equal(result.parserHealthRows.length, 3);
  assert.equal(Number(result.parserHealthAverage.toFixed(6)), Number(((0.9 + 0.6 + 0) / 3).toFixed(6)));
  assert.equal(result.fingerprintCount, 2);
  assert.equal(result.contribution, contributionResult);
});

test('buildFinalizationMetricsContext defaults to empty aggregates when source rows are absent', () => {
  const result = buildFinalizationMetricsContext({
    sourceResults: [],
    fieldOrder: [],
    normalized: { fields: {} },
    provenance: {},
    collectContributionFieldsFn: () => ({ llmFields: [] }),
  });

  assert.equal(result.parserHealthRows.length, 0);
  assert.equal(result.parserHealthAverage, 0);
  assert.equal(result.fingerprintCount, 0);
});
