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

test('per-field evidence enforcement defaults on for evidence_required fields and ignores non-required fields', () => {
  const missingResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54, connection: 'wired' },
    provenance: {
      connection: goodProvenance('connection')
    },
    fieldOrder: ['weight', 'connection'],
    enforceEvidence: false,
    evidencePack: goodEvidencePack
  });
  assert.equal(missingResult.fields.weight, 'unk');
  assert.equal(missingResult.fields.connection, 'wired');

  const incompleteResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54 },
    provenance: {
      weight: { url: 'https://example.com' }
    },
    fieldOrder: ['weight'],
    enforceEvidence: false,
    evidencePack: goodEvidencePack
  });
  assert.equal(incompleteResult.fields.weight, 'unk');

  const mixedResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54, sensor: 'PAW3395', connection: 'wired' },
    provenance: {
      weight: goodProvenance('weight')
    },
    fieldOrder: ['weight', 'sensor', 'connection'],
    enforceEvidence: false,
    evidencePack: goodEvidencePack
  });
  assert.equal(mixedResult.fields.weight, 54);
  assert.equal(mixedResult.fields.sensor, 'unk');
  assert.equal(mixedResult.fields.connection, 'wired');
  assert.deepEqual(
    mixedResult.failures.filter((row) => row.stage === 'evidence').map((row) => row.field),
    ['sensor']
  );
});

test('respectPerFieldEvidence opt-out skips per-field evidence checks but still skips unknown values by design', () => {
  const optOutResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54, sensor: 'PAW3395' },
    provenance: {},
    fieldOrder: ['weight', 'sensor'],
    enforceEvidence: false,
    respectPerFieldEvidence: false,
    evidencePack: null
  });
  assert.equal(optOutResult.fields.weight, 54);
  assert.equal(optOutResult.fields.sensor, 'PAW3395');
  assert.equal(optOutResult.failures.some((row) => row.stage === 'evidence'), false);

  const unknownResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 'unk', sensor: 'unk' },
    provenance: {},
    fieldOrder: ['weight', 'sensor'],
    enforceEvidence: false,
    evidencePack: null
  });
  assert.equal(unknownResult.failures.some((row) => row.stage === 'evidence'), false);
});
