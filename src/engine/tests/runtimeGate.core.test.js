import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import { withBaseEngine } from './helpers/runtimeGateHarness.js';

test('applyRuntimeFieldRules normalizes values via engine contracts', async () => {
  await withBaseEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: {
        weight: '3.5 oz',
        connection: 'usb wired',
        dpi: '26000'
      },
      provenance: {},
      fieldOrder: ['weight', 'connection', 'dpi']
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 99.22325);
    assert.equal(result.fields.connection, 'wired');
    assert.equal(result.failures.length, 0);
  });
});

test('applyRuntimeFieldRules rejects closed enum values outside known set', async () => {
  await withBaseEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: {
        connection: 'satellite'
      },
      provenance: {},
      fieldOrder: ['connection']
    });

    assert.equal(result.fields.connection, 'unk');
    assert.equal(
      result.failures.some((row) => row.field === 'connection' && row.reason_code === 'enum_value_not_allowed'),
      true
    );
  });
});

test('applyRuntimeFieldRules enforces cross-validation errors', async () => {
  await withBaseEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: {
        dpi: 99000
      },
      provenance: {},
      fieldOrder: ['dpi']
    });

    assert.equal(result.fields.dpi, 'unk');
    assert.equal(
      result.failures.some((row) => row.field === 'dpi' && row.reason_code === 'cross_validation_failed'),
      true
    );
  });
});

test('applyRuntimeFieldRules can enforce strict evidence audit', async () => {
  await withBaseEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: {
        connection: 'wired'
      },
      provenance: {
        connection: {
          evidence: [
            { url: 'https://example.com/specs' }
          ]
        }
      },
      fieldOrder: ['connection'],
      enforceEvidence: true,
      evidencePack: {
        snippets: []
      }
    });

    assert.equal(result.fields.connection, 'unk');
    assert.equal(
      result.failures.some((row) => row.field === 'connection' && row.reason_code === 'evidence_missing'),
      true
    );
  });
});

test('applyRuntimeFieldRules reports open-enum curation suggestions', async () => {
  await withBaseEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: {
        coating: 'satin microtexture'
      },
      provenance: {},
      fieldOrder: ['coating']
    });

    assert.equal(result.fields.coating, 'satin microtexture');
    assert.equal(Array.isArray(result.curation_suggestions), true);
    assert.equal(result.curation_suggestions.length, 1);
    assert.equal(result.curation_suggestions[0].field_key, 'coating');
  });
});

test('no-op: applyRuntimeFieldRules returns early when engine is null', () => {
  const result = applyRuntimeFieldRules({
    engine: null,
    fields: { weight: 54 },
    enforceEvidence: false
  });

  assert.equal(result.applied, false);
  assert.equal(result.fields.weight, 54);
  assert.equal(result.failures.length, 0);
});
