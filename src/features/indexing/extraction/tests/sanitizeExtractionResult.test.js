import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeExtractionResult } from '../sanitizeExtractionResult.js';

test('sanitizeExtractionResult drops invalid candidates and records notes plus metrics', () => {
  const result = sanitizeExtractionResult({
    result: {
      identityCandidates: {
        brand: 'Razer',
        model: 'Viper V3 Pro'
      },
      fieldCandidates: [
        {
          field: 'sensor',
          value: 'Focus Pro 35K',
          evidenceRefs: ['ref-sensor'],
          keyPath: 'llm.sensor',
          quote: 'Focus Pro 35K'
        },
        {
          field: 'sensor',
          value: 'unk',
          evidenceRefs: ['ref-sensor']
        },
        {
          field: 'weight',
          value: '54g',
          evidenceRefs: []
        },
        {
          field: 'sensor',
          value: 'PAW3395',
          evidenceRefs: ['missing-ref']
        },
        {
          field: 'shape',
          value: 'symmetrical',
          evidenceRefs: ['ref-sensor']
        }
      ],
      conflicts: [
        {
          field: 'sensor',
          values: ['Focus Pro 35K', 'PAW3395'],
          evidenceRefs: ['ref-sensor', 'missing-ref']
        }
      ],
      notes: [' raw note ']
    },
    job: {
      identityLock: {
        brand: 'Locked Brand'
      }
    },
    fieldSet: new Set(['sensor', 'weight']),
    validRefs: new Set(['ref-sensor']),
    evidencePack: {
      snippets: [
        {
          id: 'ref-sensor',
          normalized_text: 'Sensor: Focus Pro 35K'
        }
      ]
    },
    minEvidenceRefsByField: {
      sensor: 1,
      weight: 2
    }
  });

  assert.deepEqual(result.identityCandidates, {
    model: 'Viper V3 Pro'
  });
  assert.equal(result.fieldCandidates.length, 1);
  assert.deepEqual(result.fieldCandidates[0], {
    field: 'sensor',
    value: 'Focus Pro 35K',
    method: 'llm_extract',
    keyPath: 'llm.sensor',
    evidenceRefs: ['ref-sensor'],
    snippetId: 'ref-sensor',
    snippetHash: '',
    quote: 'Focus Pro 35K',
    low_evidence_escalated: false,
    quoteSpan: null
  });
  assert.deepEqual(result.conflicts, [
    {
      field: 'sensor',
      values: ['Focus Pro 35K', 'PAW3395'],
      evidenceRefs: ['ref-sensor']
    }
  ]);
  assert.deepEqual(result.notes, ['raw note']);
  assert.deepEqual(result.metrics, {
    raw_candidate_count: 5,
    accepted_candidate_count: 1,
    dropped_unknown_field: 1,
    dropped_unknown_value: 1,
    dropped_missing_refs: 2,
    dropped_insufficient_refs: 0,
    escalated_low_evidence_count: 0,
    dropped_invalid_refs: 1,
    dropped_evidence_verifier: 0
  });
});

test('sanitizeExtractionResult escalates low-evidence candidates when configured', () => {
  const result = sanitizeExtractionResult({
    result: {
      identityCandidates: {},
      fieldCandidates: [
        {
          field: 'sensor',
          value: 'Focus Pro 35K',
          evidenceRefs: ['ref-sensor']
        }
      ],
      conflicts: [],
      notes: []
    },
    job: {
      identityLock: {}
    },
    fieldSet: new Set(['sensor']),
    validRefs: new Set(['ref-sensor']),
    evidencePack: {
      snippets: [
        {
          id: 'ref-sensor',
          normalized_text: 'Sensor: Focus Pro 35K'
        }
      ]
    },
    minEvidenceRefsByField: {
      sensor: 2
    },
    insufficientEvidenceAction: 'escalate'
  });

  assert.equal(result.fieldCandidates.length, 1);
  assert.equal(result.fieldCandidates[0].method, 'llm_extract_escalated_low_evidence');
  assert.equal(result.fieldCandidates[0].low_evidence_escalated, true);
  assert.deepEqual(result.notes, ['Escalated 1 low-evidence candidates.']);
  assert.deepEqual(result.metrics, {
    raw_candidate_count: 1,
    accepted_candidate_count: 1,
    dropped_unknown_field: 0,
    dropped_unknown_value: 0,
    dropped_missing_refs: 0,
    dropped_insufficient_refs: 0,
    escalated_low_evidence_count: 1,
    dropped_invalid_refs: 0,
    dropped_evidence_verifier: 0
  });
});
