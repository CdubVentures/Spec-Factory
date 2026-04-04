import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../../db/specDb.js';
import {
  buildReviewQueue,
  makeStorage,
  seedCategoryArtifacts,
} from './helpers/reviewGridDataHarness.js';

// WHY: Queue module retired — buildReviewQueue no longer enumerates products
// from queue state. It returns an empty list since the product enumeration
// source was removed. This test confirms the empty-return contract.
test('buildReviewQueue returns empty after queue retirement', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-queue-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const specDb = new SpecDb({ dbPath: ':memory:', category });

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);

    const queue = await buildReviewQueue({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10,
      specDb,
    });
    assert.equal(queue.length, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
