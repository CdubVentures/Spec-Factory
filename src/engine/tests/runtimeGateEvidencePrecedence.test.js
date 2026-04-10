import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import { createEvidenceFixtureRoot } from './helpers/runtimeGateHarness.js';

const fixture = await createEvidenceFixtureRoot();
const engine = await FieldRulesEngine.create('mouse', {
  config: { categoryAuthorityRoot: fixture.helperRoot }
});

test.after(async () => {
  await fs.rm(fixture.root, { recursive: true, force: true });
});

test('runtimeGate runs normalize before evidence and skips evidence failures for already-unknown fields', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: {
      weight: '999999'
    },
    provenance: {
      weight: {
        url: 'https://example.com/specs',
        snippet_id: 's1',
        quote: '999999',
        source_id: 'example_com'
      }
    },
    fieldOrder: ['weight'],
    enforceEvidence: true,
    evidencePack: {
      snippets: [{
        id: 's1',
        source_id: 'example_com',
        normalized_text: 'Weight: 999999 grams',
        snippet_hash: 'sha256:test'
      }],
      references: [{ id: 's1', url: 'https://example.com/specs' }]
    }
  });

  assert.equal(result.fields.weight, null);
  assert.equal(
    result.failures.some(
      (row) => row.field === 'weight'
        && row.stage === 'normalize'
        && row.reason_code === 'out_of_range'
    ),
    true
  );
  assert.equal(
    result.changes.some(
      (row) => row.field === 'weight'
        && row.stage === 'normalize'
        && row.after === null
    ),
    true
  );
});
