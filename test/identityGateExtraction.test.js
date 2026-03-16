import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIdentityGateToCandidates,
  isIdentityGatedField,
  resolveIdentityLabel
} from '../src/pipeline/identityGateExtraction.js';

describe('applyIdentityGateToCandidates', () => {
  it('annotates candidates with identity_label and identity_confidence when identity matches', () => {
    const candidates = [
      { field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract' },
      { field: 'sensor', value: 'PAW3950', confidence: 0.85, method: 'html_table' }
    ];
    const identity = { match: true, score: 0.92, decision: 'ACCEPT' };

    const result = applyIdentityGateToCandidates(candidates, identity);
    assert.equal(result.length, 2);
    assert.equal(result[0].value, '58g');
    assert.equal(result[0].identity_label, 'matched');
    assert.equal(result[0].identity_confidence, 0.92);
    assert.equal(result[0].confidence, 0.9, 'confidence is NOT modified');
    assert.equal(result[1].identity_label, 'matched');
  });

  it('annotates with identity_label when identity does not match', () => {
    const candidates = [
      { field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract' },
      { field: 'dpi', value: '30000', confidence: 0.8, method: 'html_table' }
    ];
    const identity = { match: false, score: 0.35, decision: 'REJECT' };

    const result = applyIdentityGateToCandidates(candidates, identity);
    assert.equal(result.length, 2);
    assert.equal(result[0].identity_label, 'different');
    assert.equal(result[0].identity_confidence, 0.35);
    assert.equal(result[0].confidence, 0.9, 'confidence is NOT capped');
    assert.equal(result[1].confidence, 0.8, 'confidence is NOT capped');
  });

  it('does NOT cap confidence — confidence passes through unchanged', () => {
    const candidates = [
      { field: 'weight', value: '58g', confidence: 0.95, method: 'llm_extract' }
    ];
    const identity = { match: false, score: 0.3, decision: 'REJECT' };

    const result = applyIdentityGateToCandidates(candidates, identity);
    assert.equal(result[0].confidence, 0.95, 'confidence unchanged');
    assert.equal(result[0].identity_label, 'different');
  });

  it('returns empty array for empty candidates', () => {
    const result = applyIdentityGateToCandidates([], { match: true, score: 0.9 });
    assert.deepEqual(result, []);
  });

  it('handles null/undefined identity — labels as unknown', () => {
    const candidates = [
      { field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract' }
    ];
    const result = applyIdentityGateToCandidates(candidates, null);
    assert.equal(result.length, 1);
    assert.equal(result[0].identity_label, 'unknown');
    assert.equal(result[0].identity_confidence, 0);
    assert.equal(result[0].confidence, 0.9, 'confidence unchanged');
  });

  it('handles null/undefined candidates gracefully', () => {
    const result = applyIdentityGateToCandidates(null, { match: true, score: 0.9 });
    assert.deepEqual(result, []);
  });

  it('does not mutate original candidates', () => {
    const original = { field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract' };
    const candidates = [original];
    const identity = { match: false, score: 0.3, decision: 'REJECT' };

    applyIdentityGateToCandidates(candidates, identity);
    assert.equal(original.confidence, 0.9);
    assert.equal(original.identity_label, undefined);
  });

  it('labels possible when score >= 0.4 and no match and no conflicts', () => {
    const candidates = [
      { field: 'brand', value: 'Razer', confidence: 0.95, method: 'html_table' },
    ];
    const identity = { match: false, score: 0.5, decision: 'REJECT' };

    const result = applyIdentityGateToCandidates(candidates, identity);
    assert.equal(result[0].identity_label, 'possible');
    assert.equal(result[0].confidence, 0.95, 'no capping');
  });
});

describe('isIdentityGatedField', () => {
  it('returns true for identity-level fields', () => {
    assert.equal(isIdentityGatedField('brand'), true);
    assert.equal(isIdentityGatedField('model'), true);
    assert.equal(isIdentityGatedField('variant'), true);
    assert.equal(isIdentityGatedField('sku'), true);
    assert.equal(isIdentityGatedField('base_model'), true);
  });

  it('returns false for regular fields', () => {
    assert.equal(isIdentityGatedField('weight'), false);
    assert.equal(isIdentityGatedField('dpi'), false);
    assert.equal(isIdentityGatedField('sensor'), false);
  });

  it('handles empty/null values', () => {
    assert.equal(isIdentityGatedField(''), false);
    assert.equal(isIdentityGatedField(null), false);
    assert.equal(isIdentityGatedField(undefined), false);
  });

  it('is case-insensitive', () => {
    assert.equal(isIdentityGatedField('Brand'), true);
    assert.equal(isIdentityGatedField('MODEL'), true);
  });
});
