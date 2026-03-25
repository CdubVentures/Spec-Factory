import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import {
  createEvidenceFixtureRoot,
  goodEvidencePack,
  goodProvenance,
} from './helpers/runtimeGateHarness.js';

const fixture = await createEvidenceFixtureRoot();
const engine = await FieldRulesEngine.create('mouse', {
  config: { categoryAuthorityRoot: fixture.helperRoot }
});

test.after(async () => {
  await fs.rm(fixture.root, { recursive: true, force: true });
});

test('global enforceEvidence audits all fields and overrides per-field opt-out', () => {
  const failResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54, connection: 'wired' },
    provenance: {},
    fieldOrder: ['weight', 'connection'],
    enforceEvidence: true,
    respectPerFieldEvidence: false,
    evidencePack: goodEvidencePack
  });

  assert.equal(failResult.fields.weight, 'unk');
  assert.equal(failResult.fields.connection, 'unk');
  assert.deepEqual(
    failResult.failures.filter((row) => row.stage === 'evidence').map((row) => row.field).sort(),
    ['connection', 'weight']
  );

  const passResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54, connection: 'wired' },
    provenance: {
      weight: goodProvenance('weight'),
      connection: goodProvenance('connection')
    },
    fieldOrder: ['weight', 'connection'],
    enforceEvidence: true,
    evidencePack: goodEvidencePack
  });

  assert.equal(passResult.fields.weight, 54);
  assert.equal(passResult.fields.connection, 'wired');
  assert.equal(passResult.failures.some((row) => row.stage === 'evidence'), false);
});
