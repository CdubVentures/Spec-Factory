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

test('min_evidence_refs threshold requires at least two distinct refs and records count failures deterministically', () => {
  const failResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54 },
    provenance: buildProvenance('weight', [
      makeEvidence('https://example.com/specs', 's1', '54 g')
    ]),
    fieldOrder: ['weight'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });

  assert.equal(failResult.fields.weight, 'unk');
  const failure = failResult.failures.find(
    (row) => row.field === 'weight'
      && row.stage === 'evidence'
      && row.reason_code === 'evidence_insufficient_refs'
  );
  assert.ok(failure);
  const change = failResult.changes.find(
    (row) => row.field === 'weight' && row.stage === 'evidence'
  );
  assert.ok(change);
  assert.equal(change.before, 54);
  assert.equal(change.after, 'unk');

  const passResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54 },
    provenance: buildProvenance('weight', [
      makeEvidence('https://example.com/specs', 's1', '54 g'),
      makeEvidence('https://manufacturer.com/product', 's2', '54 g')
    ]),
    fieldOrder: ['weight'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });

  assert.equal(passResult.fields.weight, 54);
  assert.equal(passResult.failures.some((row) => row.stage === 'evidence'), false);
});
