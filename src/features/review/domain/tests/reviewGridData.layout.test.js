import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildReviewLayout,
  buildProductReviewPayload,
  buildReviewQueue,
  writeCategoryReviewArtifacts,
  writeProductReviewArtifacts,
  buildFieldState,
  makeStorage,
  writeJson,
  seedCategoryArtifacts,
  seedLatestArtifacts,
  seedQueueState,
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
            conflict_policy: 'preserve_all_candidates',
          },
          component: { type: 'sensor' },
          consumers: {
            'contract.type': { review: false },
            'evidence.min_evidence_refs': { review: false },
            'evidence.conflict_policy': { review: false },
            'component.type': { review: false },
          },
          field_studio_hints: {
            dataEntry: { sheet: 'dataEntry', row: 9, key_cell: 'B9' }
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
    assert.equal(row.field_rule.conflict_policy, 'resolve_by_tier');
    assert.equal(row.field_rule.component_type, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('buildReviewLayout ignores parse.unit and priority.publish_gate when deriving review field metadata — characterization (GAP-9)', async () => {
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
            dataEntry: { sheet: 'dataEntry', row: 9, key_cell: 'B9' }
          },
          ui: { label: 'Weight', group: 'General', order: 9 },
        },
      },
    });

    const layout = await buildReviewLayout({ storage, config, category });
    const row = layout.rows.find((entry) => entry.key === 'weight');
    assert.ok(row, 'expected weight field row');
    assert.equal(row.field_rule.required, false, 'review field metadata should continue following required_level, not priority.publish_gate');
    assert.equal(row.field_rule.units, null, 'review field metadata should not source units from parse.unit');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
