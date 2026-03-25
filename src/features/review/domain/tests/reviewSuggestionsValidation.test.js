import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendReviewSuggestion } from '../suggestions.js';

test('appendReviewSuggestion requires evidence url and quote', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-suggestions-validation-'));
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
  };
  try {
    await assert.rejects(
      () => appendReviewSuggestion({
        config,
        category: 'mouse',
        type: 'enum',
        payload: {
          product_id: 'mouse-a',
          field: 'switch_type',
          value: 'optical-v2',
          evidence: {
            url: '',
            quote: '',
          },
        },
      }),
      /requires evidence.url and evidence.quote/i,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
