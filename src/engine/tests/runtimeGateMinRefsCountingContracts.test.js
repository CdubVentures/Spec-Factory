import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import {
  createMinRefsFixtureRoot,
  buildProvenance,
  makeEvidence,
  minRefsEvidencePack,
} from './helpers/runtimeGateHarness.js';

const fixture = await createMinRefsFixtureRoot();
const engine = await FieldRulesEngine.create('mouse', {
  config: { categoryAuthorityRoot: fixture.helperRoot }
});

test.after(async () => {
  await fs.rm(fixture.root, { recursive: true, force: true });
});

test('min_evidence_refs counts only distinct (url, snippet_id) pairs with snippet ids present', () => {
  const cases = [
    {
      label: 'duplicate pairs collapse to one distinct ref',
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com/specs', 's1', '54 g'),
        makeEvidence('https://example.com/specs', 's1', '54 grams'),
        makeEvidence('https://example.com/specs', 's1', '54g')
      ])
    },
    {
      label: 'entries without snippet_id do not count',
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com/specs', 's1', '54 g'),
        { url: 'https://other.com', quote: '54 g' }
      ])
    }
  ];

  for (const { label, provenance } of cases) {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance,
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.fields.weight, null, label);
    assert.equal(
      result.failures.some(
        (row) => row.field === 'weight'
          && row.stage === 'evidence'
          && row.reason_code === 'evidence_insufficient_refs'
      ),
      true,
      label
    );
  }
});
