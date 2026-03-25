import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildReviewLayout,
  makeStorage,
  seedCategoryArtifacts,
} from './helpers/reviewGridDataHarness.js';

test('buildReviewLayout follows field-studio row order and inherits blank group labels', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-layout-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, 'mouse');
    const layout = await buildReviewLayout({ storage, config, category: 'mouse' });
    assert.equal(layout.category, 'mouse');
    assert.equal(layout.field_studio.key_range, 'B9:B11');
    assert.equal(layout.rows.length, 3);
    assert.deepEqual(layout.rows.map((row) => row.key), ['weight', 'dpi', 'connection']);
    assert.equal(layout.rows[0].group, 'General');
    assert.equal(layout.rows[1].group, 'General');
    assert.equal(layout.rows[2].group, 'Connectivity');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
