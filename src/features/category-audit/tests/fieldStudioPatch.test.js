import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  FIELD_STUDIO_PATCH_SCHEMA_VERSION,
  applyFieldStudioPatchDocument,
  applyFieldStudioPatchDocuments,
  expectedFieldStudioPatchFileName,
  importFieldStudioPatchDirectory,
  loadFieldStudioPatchDocuments,
  validateFieldStudioPatchDocument,
} from '../fieldStudioPatch.js';

function validPatch(overrides = {}) {
  return {
    schema_version: FIELD_STUDIO_PATCH_SCHEMA_VERSION,
    category: 'mouse',
    field_key: 'design',
    navigator_ordinal: 7,
    verdict: 'minor_revise',
    patch: {
      data_lists: [
        {
          field: 'design',
          manual_values: ['standard', 'limited edition', 'collaboration', 'multiple'],
        },
      ],
      field_overrides: {
        design: {
          enum: { policy: 'closed', source: 'data_lists.design' },
          ai_assist: {
            pif_priority_images: { enabled: true },
            reasoning_note: 'Classify public edition taxonomy only.',
          },
        },
      },
    },
    audit: {
      sources_checked: ['https://example.test/source'],
      products_checked: ['Example Mouse'],
      conclusion: 'Evidence supports a closed edition taxonomy.',
    },
    ...overrides,
  };
}

function baseMap() {
  return {
    version: 2,
    selected_keys: ['design', 'weight'],
    data_lists: [
      {
        field: 'design',
        mode: 'scratch',
        normalize: 'lower_trim',
        manual_values: ['standard', 'limited'],
        ai_assist: { reasoning_note: 'old enum note' },
      },
    ],
    field_overrides: {
      design: {
        field_key: 'design',
        enum: { policy: 'open_prefer_known', source: 'data_lists.design' },
        ai_assist: {
          reasoning_note: 'old field note',
          variant_inventory_usage: { mode: 'default' },
        },
        search_hints: { query_terms: ['design'], domain_hints: [] },
      },
      weight: {
        field_key: 'weight',
        contract: { type: 'number', shape: 'scalar', unit: 'g' },
      },
    },
  };
}

test('expectedFieldStudioPatchFileName keeps category, order, key, and schema version in the file name', () => {
  assert.equal(
    expectedFieldStudioPatchFileName({ category: 'mouse', fieldKey: 'design', navigatorOrdinal: 7 }),
    'mouse-07-design.field-studio-patch.v1.json',
  );
  assert.equal(
    expectedFieldStudioPatchFileName({ category: 'mouse', fieldKey: 'design' }),
    'mouse-design.field-studio-patch.v1.json',
  );
});

test('validateFieldStudioPatchDocument accepts the strict import envelope and matching filename', () => {
  const parsed = validateFieldStudioPatchDocument(validPatch(), {
    category: 'mouse',
    fileName: 'mouse-07-design.field-studio-patch.v1.json',
  });

  assert.equal(parsed.schema_version, FIELD_STUDIO_PATCH_SCHEMA_VERSION);
  assert.equal(parsed.category, 'mouse');
  assert.equal(parsed.field_key, 'design');
  assert.equal(parsed.navigator_ordinal, 7);
});

test('validateFieldStudioPatchDocument rejects prose sentinels and filename/body mismatches', () => {
  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: { field_overrides: { design: { ai_assist: { reasoning_note: 'No change' } } } },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /No change/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch(), {
      category: 'mouse',
      fileName: 'mouse-08-lighting.field-studio-patch.v1.json',
    }),
    /filename.*field_key/i,
  );

  assert.throws(
    () => validateFieldStudioPatchDocument(validPatch({
      patch: { field_overrides: { lighting: { enum: { policy: 'closed' } } } },
    }), { category: 'mouse', fileName: 'mouse-07-design.field-studio-patch.v1.json' }),
    /only patch field_overrides\.design/i,
  );
});

test('applyFieldStudioPatchDocument deep-merges one key and data list without touching unrelated settings', () => {
  const next = applyFieldStudioPatchDocument(baseMap(), validPatch());

  assert.deepEqual(next.data_lists[0].manual_values, [
    'standard',
    'limited edition',
    'collaboration',
    'multiple',
  ]);
  assert.equal(next.data_lists[0].mode, 'scratch', 'existing data list metadata is preserved');
  assert.equal(next.data_lists[0].normalize, 'lower_trim');
  assert.equal(next.field_overrides.design.enum.policy, 'closed');
  assert.equal(next.field_overrides.design.ai_assist.reasoning_note, 'Classify public edition taxonomy only.');
  assert.deepEqual(next.field_overrides.design.ai_assist.pif_priority_images, { enabled: true });
  assert.deepEqual(next.field_overrides.design.ai_assist.variant_inventory_usage, { mode: 'default' });
  assert.equal(next.field_overrides.weight.contract.unit, 'g');
});

test('loadFieldStudioPatchDocuments loads valid patch files from a folder in filename order', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'field-studio-patches-'));
  try {
    await fs.writeFile(
      path.join(dir, 'mouse-09-rgb.field-studio-patch.v1.json'),
      JSON.stringify(validPatch({ field_key: 'rgb', navigator_ordinal: 9, patch: { field_overrides: { rgb: { field_key: 'rgb' } } } })),
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'mouse-07-design.field-studio-patch.v1.json'),
      JSON.stringify(validPatch()),
      'utf8',
    );
    await fs.writeFile(path.join(dir, 'notes.txt'), 'ignored', 'utf8');

    const docs = await loadFieldStudioPatchDocuments({ category: 'mouse', inputDir: dir });
    assert.deepEqual(docs.map((doc) => doc.field_key), ['design', 'rgb']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('importFieldStudioPatchDirectory applies a batch then validates the full resulting map', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'field-studio-import-'));
  try {
    await fs.writeFile(
      path.join(dir, 'mouse-07-design.field-studio-patch.v1.json'),
      JSON.stringify(validPatch()),
      'utf8',
    );

    const result = await importFieldStudioPatchDirectory({
      category: 'mouse',
      inputDir: dir,
      fieldStudioMap: baseMap(),
      validateFieldStudioMap: (map) => ({
        valid: map.field_overrides.design.enum.policy === 'closed',
        errors: [],
        normalized: map,
      }),
    });

    assert.equal(result.applied.length, 1);
    assert.equal(result.validation.valid, true);
    assert.equal(result.fieldStudioMap.field_overrides.design.enum.policy, 'closed');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('applyFieldStudioPatchDocuments applies multiple validated key files as one map update', () => {
  const docs = [
    validPatch(),
    validPatch({
      field_key: 'weight',
      navigator_ordinal: 24,
      patch: {
        field_overrides: {
          weight: {
            evidence: { min_evidence_refs: 2 },
          },
        },
      },
    }),
  ];

  const next = applyFieldStudioPatchDocuments(baseMap(), docs);
  assert.equal(next.field_overrides.design.enum.policy, 'closed');
  assert.equal(next.field_overrides.weight.evidence.min_evidence_refs, 2);
});
