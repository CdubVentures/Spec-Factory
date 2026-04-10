import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildReviewLayout,
  makeStorage,
  writeJson,
} from './helpers/reviewGridDataHarness.js';

test('buildReviewLayout strips review-disabled rule paths before deriving field_rule metadata', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-layout-gates-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  try {
    const generated = path.join(config.categoryAuthorityRoot, category, '_generated');
    await writeJson(path.join(generated, 'field_rules.json'), {
      category,
      fields: {
        connection: {
          required_level: 'required',
          contract: { type: 'enum', shape: 'scalar', unit: 'ghz' },
          evidence: {
            min_evidence_refs: 3,
          },
          component: { type: 'sensor' },
          consumers: {
            'contract.type': { review: false },
            'evidence.min_evidence_refs': { review: false },
            'component.type': { review: false },
          },
          field_studio_hints: {
            dataEntry: { sheet: 'dataEntry', row: 9, key_cell: 'B9' },
          },
          ui: { label: 'Connection', group: 'Connectivity', order: 9 },
        },
      },
    });

    const layout = await buildReviewLayout({ storage, config, category });
    const row = layout.rows.find((entry) => entry.key === 'connection');
    assert.ok(row, 'expected connection field row');
    assert.equal(row.field_rule.type, 'string');
    assert.equal(row.field_rule.min_evidence_refs, 1);
    assert.equal(row.field_rule.component_type, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
