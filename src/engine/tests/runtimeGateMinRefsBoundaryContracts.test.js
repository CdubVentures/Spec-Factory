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

test('min_evidence_refs honors min=1 and min=0 boundaries while still enforcing count when min>0 even for non-required fields', () => {
  const minOneResult = applyRuntimeFieldRules({
    engine,
    fields: { connection: 'wired' },
    provenance: buildProvenance('connection', [
      makeEvidence('https://example.com', 's1', 'wired')
    ]),
    fieldOrder: ['connection'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });
  assert.equal(minOneResult.fields.connection, 'wired');

  const minZeroResult = applyRuntimeFieldRules({
    engine,
    fields: { coating: 'matte' },
    provenance: {},
    fieldOrder: ['coating'],
    enforceEvidence: false,
    evidencePack: null
  });
  assert.equal(minZeroResult.fields.coating, 'matte');
  assert.equal(minZeroResult.failures.some((row) => row.stage === 'evidence'), false);

  const noProvResult = applyRuntimeFieldRules({
    engine,
    fields: { dpi: 16000 },
    provenance: {},
    fieldOrder: ['dpi'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });
  assert.equal(noProvResult.fields.dpi, null);

  const oneRefResult = applyRuntimeFieldRules({
    engine,
    fields: { dpi: 16000 },
    provenance: buildProvenance('dpi', [
      makeEvidence('https://example.com', 's1', '16000')
    ]),
    fieldOrder: ['dpi'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });
  assert.equal(oneRefResult.fields.dpi, null);
  assert.equal(
    oneRefResult.failures.some((row) => row.reason_code === 'evidence_insufficient_refs'),
    true
  );

  const twoRefResult = applyRuntimeFieldRules({
    engine,
    fields: { dpi: 16000 },
    provenance: buildProvenance('dpi', [
      makeEvidence('https://a.com', 's1', '16000'),
      makeEvidence('https://b.com', 's3', '16000')
    ]),
    fieldOrder: ['dpi'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });
  assert.equal(twoRefResult.fields.dpi, 16000);

  const globalEnforceResult = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54 },
    provenance: buildProvenance('weight', [
      makeEvidence('https://example.com', 's1', '54 g')
    ]),
    fieldOrder: ['weight'],
    enforceEvidence: true,
    evidencePack: minRefsEvidencePack
  });
  assert.equal(globalEnforceResult.fields.weight, null);
});

test('quality failures short-circuit count failures for min_evidence_refs enforcement', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: { weight: 54 },
    provenance: buildProvenance('weight', [
      { url: 'https://example.com' },
      { url: 'https://other.com' }
    ]),
    fieldOrder: ['weight'],
    enforceEvidence: false,
    evidencePack: minRefsEvidencePack
  });

  assert.equal(result.fields.weight, null);
  const evidenceFailures = result.failures.filter((row) => row.field === 'weight' && row.stage === 'evidence');
  assert.equal(evidenceFailures.length, 1);
  assert.notEqual(evidenceFailures[0].reason_code, 'evidence_insufficient_refs');
});
