import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import {
  withMinRefsEngine,
  buildProvenance,
  makeEvidence,
  minRefsEvidencePack,
} from '../../../test/helpers/runtimeGateHarness.js';

test('min-refs: min=2 with 1 distinct ref -> fail', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com/specs', 's1', '54 g')
      ]),
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight should be unk - only 1 ref, need 2');
    const failure = result.failures.find((row) => row.field === 'weight' && row.stage === 'evidence');
    assert.ok(failure, 'should have evidence failure');
    assert.equal(failure.reason_code, 'evidence_insufficient_refs');
  });
});

test('min-refs: min=2 with 2 distinct refs -> pass', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
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

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 54, 'weight should pass with 2 distinct refs');
    const evidenceFailures = result.failures.filter((row) => row.stage === 'evidence');
    assert.equal(evidenceFailures.length, 0, 'no evidence failures');
  });
});

test('min-refs: min=2 with 3 distinct refs -> pass', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: buildProvenance('weight', [
        makeEvidence('https://a.com', 's1', '54 g'),
        makeEvidence('https://b.com', 's2', '54 g'),
        makeEvidence('https://c.com', 's3', '54 g')
      ]),
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 54, 'weight should pass with 3 refs (need 2)');
  });
});

test('min-refs: duplicate (url, snippet_id) pairs are deduplicated', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com/specs', 's1', '54 g'),
        makeEvidence('https://example.com/specs', 's1', '54 grams'),
        makeEvidence('https://example.com/specs', 's1', '54g')
      ]),
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight unk - 3 entries but only 1 distinct pair');
  });
});

test('min-refs: evidence entries without snippet_id are not counted', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com/specs', 's1', '54 g'),
        { url: 'https://other.com', quote: '54 g' }
      ]),
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight unk - entry without snippet_id not counted');
  });
});

test('min-refs: min=1 only runs quality check, no count check', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { connection: 'wired' },
      provenance: buildProvenance('connection', [
        makeEvidence('https://example.com', 's1', 'wired')
      ]),
      fieldOrder: ['connection'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.connection, 'wired', 'connection passes with 1 ref (min=1)');
  });
});

test('min-refs: min=0 + evidence_required=false -> no evidence checks', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { coating: 'matte' },
      provenance: {},
      fieldOrder: ['coating'],
      enforceEvidence: false,
      evidencePack: null
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.coating, 'matte', 'coating passes - min=0, not required');
    const evidenceFailures = result.failures.filter((row) => row.stage === 'evidence');
    assert.equal(evidenceFailures.length, 0);
  });
});

test('min-refs: min=2 + evidence_required=false still enforces quality and count', async () => {
  await withMinRefsEngine((engine) => {
    const noProvResult = applyRuntimeFieldRules({
      engine,
      fields: { dpi: 16000 },
      provenance: {},
      fieldOrder: ['dpi'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });
    assert.equal(noProvResult.fields.dpi, 'unk', 'dpi unk - no provenance, min>0 triggers quality check');

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
    assert.equal(oneRefResult.fields.dpi, 'unk', 'dpi unk - 1 ref but need 2');
    const countFail = oneRefResult.failures.find((row) => row.reason_code === 'evidence_insufficient_refs');
    assert.ok(countFail, 'should have insufficient refs failure');

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
    assert.equal(twoRefResult.fields.dpi, 16000, 'dpi passes with 2 refs');
  });
});

test('min-refs: respectPerFieldEvidence=false skips count check', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: {},
      fieldOrder: ['weight'],
      enforceEvidence: false,
      respectPerFieldEvidence: false,
      evidencePack: null
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 54, 'weight stays - opt-out disables per-field checks');
  });
});

test('min-refs: enforceEvidence=true with min=2 and 1 ref -> fail count', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com', 's1', '54 g')
      ]),
      fieldOrder: ['weight'],
      enforceEvidence: true,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight unk - enforceEvidence=true, only 1 ref for min=2');
  });
});

test('min-refs: quality failure prevents redundant count check', async () => {
  await withMinRefsEngine((engine) => {
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

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk');
    const evidenceFailures = result.failures.filter((row) => row.stage === 'evidence');
    assert.equal(evidenceFailures.length, 1, 'only one evidence failure (quality, not count)');
    assert.notEqual(evidenceFailures[0].reason_code, 'evidence_insufficient_refs',
      'failure should be quality-related, not count');
  });
});

test('min-refs: count failure produces correct change record', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: buildProvenance('weight', [
        makeEvidence('https://example.com', 's1', '54 g')
      ]),
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    const change = result.changes.find((row) => row.stage === 'evidence' && row.field === 'weight');
    assert.ok(change, 'should have evidence change record');
    assert.equal(change.before, 54);
    assert.equal(change.after, 'unk');
  });
});

test('min-refs: empty evidence array counts as 0 distinct refs', async () => {
  await withMinRefsEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: { weight: { evidence: [] } },
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: minRefsEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight unk - empty evidence array');
  });
});
