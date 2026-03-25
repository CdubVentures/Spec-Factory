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

test('buildReviewLayout ignores parse.unit and priority.publish_gate when deriving review field metadata - characterization', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-layout-gap9-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  try {
    const generated = path.join(config.categoryAuthorityRoot, category, '_generated');
    await writeJson(path.join(generated, 'field_rules.json'), {
      category,
      fields: {
        weight: {
          required_level: 'optional',
          contract: { type: 'number', shape: 'scalar' },
          priority: { publish_gate: true },
          parse: { unit: 'g' },
          field_studio_hints: {
            dataEntry: { sheet: 'dataEntry', row: 9, key_cell: 'B9' },
          },
          ui: { label: 'Weight', group: 'General', order: 9 },
        },
      },
    });

    const layout = await buildReviewLayout({ storage, config, category });
    const row = layout.rows.find((entry) => entry.key === 'weight');
    assert.ok(row, 'expected weight field row');
    assert.equal(
      row.field_rule.required,
      false,
      'review field metadata should continue following required_level, not priority.publish_gate',
    );
    assert.equal(
      row.field_rule.units,
      null,
      'review field metadata should not source units from parse.unit',
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
