import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { registerCategoryAuditRoutes } from '../api/categoryAuditRoutes.js';

function mockCtx({ reportsRoot, categoryAuthorityRoot }) {
  const captured = { status: null, body: null };
  const jsonRes = (_res, status, body) => {
    captured.status = status;
    captured.body = body;
    return { status, body };
  };
  const readJsonBody = async (req) => req?.body || {};
  return {
    ctx: {
      jsonRes,
      readJsonBody,
      config: {
        localInputRoot: reportsRoot.replace(/[\\/]reports$/, ''),
        categoryAuthorityRoot,
        keyFinderTierSettingsJson: JSON.stringify({
          easy: { model: 'claude-haiku-4-5' },
          medium: { model: 'claude-sonnet-4-6' },
          hard: { model: 'claude-sonnet-4-6' },
          very_hard: { model: 'claude-opus-4-7' },
          fallback: { model: 'claude-sonnet-4-6' },
        }),
      },
    },
    captured,
  };
}

async function setupFixtureCategory(categoryRoot) {
  const generated = path.join(categoryRoot, '_generated');
  await fs.mkdir(generated, { recursive: true });
  await fs.mkdir(path.join(generated, 'component_db'), { recursive: true });
  await fs.writeFile(path.join(generated, 'field_rules.json'), JSON.stringify({
    category: 'mouse',
    fields: {
      sensor: {
        field_key: 'sensor',
        display_name: 'Sensor',
        priority: { required_level: 'mandatory', availability: 'always', difficulty: 'hard' },
        contract: { type: 'string', shape: 'scalar' },
        enum: { policy: 'open_prefer_known', source: 'data_lists.sensor', values: [] },
        aliases: [],
        search_hints: { domain_hints: [], query_terms: [], content_types: [] },
        constraints: [],
        component: { type: 'sensor' },
        ai_assist: { reasoning_note: '' },
        evidence: { min_evidence_refs: 1, tier_preference: [] },
        group: 'general',
        ui: { label: 'Sensor', group: 'General' },
      },
      dpi: {
        field_key: 'dpi',
        display_name: 'DPI',
        priority: { required_level: 'mandatory', availability: 'always', difficulty: 'medium' },
        contract: { type: 'number', shape: 'scalar', unit: 'dpi' },
        enum: { policy: 'open', values: [] },
        aliases: [],
        search_hints: { domain_hints: [], query_terms: [], content_types: [] },
        constraints: [],
        ai_assist: { reasoning_note: '' },
        evidence: { min_evidence_refs: 1, tier_preference: [] },
        group: 'general',
        ui: { label: 'DPI', group: 'General' },
      },
    },
  }));
  await fs.writeFile(path.join(generated, 'known_values.json'), JSON.stringify({
    category: 'mouse',
    enums: { sensor: { policy: 'open_prefer_known', values: ['PMW3395'] } },
  }));
  await fs.writeFile(path.join(generated, 'field_groups.json'), JSON.stringify({
    group_index: { general: ['sensor', 'dpi'] },
  }));
  await fs.writeFile(path.join(generated, 'component_db', 'sensor.json'), JSON.stringify({
    component_type: 'sensor',
    items: [{ name: 'PMW3395', properties: { dpi: 26000 } }],
  }));
}

test('GET /category-audit/:category/per-key-doc/:fieldKey returns the structure tree for a known key', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'per-key-doc-route-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    const handled = await handler(
      ['category-audit', 'mouse', 'per-key-doc', 'dpi'],
      null,
      'GET',
      { body: {} },
      {},
    );
    assert.notEqual(handled, false, 'handler claimed the route');
    assert.equal(captured.status, 200);
    assert.equal(captured.body.category, 'mouse');
    assert.equal(captured.body.fieldKey, 'dpi');
    assert.ok(captured.body.structure && typeof captured.body.structure === 'object', 'structure object present');
    assert.ok(Array.isArray(captured.body.structure.sections), 'sections array present');
    assert.equal(captured.body.structure.meta.fieldKey, 'dpi');
    assert.equal(captured.body.structure.meta.category, 'mouse');
    const ids = captured.body.structure.sections.map((s) => s.id);
    assert.equal(ids[0], 'header');
    assert.ok(ids.includes('purpose'));
    assert.ok(ids.includes('contract-schema'));
    assert.ok(ids.includes('category-key-map'));
    // Reorder check: category-key-map sits between siblings and example-bank.
    const idx = (id) => ids.indexOf(id);
    assert.ok(idx('siblings') < idx('category-key-map'));
    assert.ok(idx('category-key-map') < idx('example-bank'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('GET per-key-doc on unknown category returns 400 unknown_category', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'per-key-doc-route-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    const handled = await handler(
      ['category-audit', 'nonexistent', 'per-key-doc', 'dpi'],
      null,
      'GET',
      { body: {} },
      {},
    );
    assert.notEqual(handled, false, 'handler claimed the route');
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'unknown_category');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('GET per-key-doc on unknown field key returns 404 unknown_field_key', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'per-key-doc-route-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    const handled = await handler(
      ['category-audit', 'mouse', 'per-key-doc', 'no_such_field'],
      null,
      'GET',
      { body: {} },
      {},
    );
    assert.notEqual(handled, false, 'handler claimed the route');
    assert.equal(captured.status, 404);
    assert.equal(captured.body.error, 'unknown_field_key');
    assert.equal(captured.body.fieldKey, 'no_such_field');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('GET per-key-doc on a reserved field key (colors) still returns a structure with reserved-owner section', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'per-key-doc-route-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    const categoryRoot = path.join(categoryAuthorityRoot, 'mouse');
    await setupFixtureCategory(categoryRoot);
    // Add 'colors' as a reserved key in the fixture.
    const generated = path.join(categoryRoot, '_generated');
    const rules = JSON.parse(await fs.readFile(path.join(generated, 'field_rules.json'), 'utf8'));
    rules.fields.colors = {
      field_key: 'colors',
      display_name: 'Colors',
      priority: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
      contract: { type: 'string', shape: 'list' },
      enum: { policy: 'closed', values: [] },
      aliases: [],
      search_hints: { domain_hints: [], query_terms: [], content_types: [] },
      constraints: [],
      ai_assist: { reasoning_note: '' },
      evidence: { min_evidence_refs: 1, tier_preference: [] },
      group: 'product_variants',
      ui: { label: 'Colors', group: 'product_variants' },
    };
    await fs.writeFile(path.join(generated, 'field_rules.json'), JSON.stringify(rules));
    const groups = JSON.parse(await fs.readFile(path.join(generated, 'field_groups.json'), 'utf8'));
    groups.group_index.product_variants = ['colors'];
    await fs.writeFile(path.join(generated, 'field_groups.json'), JSON.stringify(groups));

    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    const handled = await handler(
      ['category-audit', 'mouse', 'per-key-doc', 'colors'],
      null,
      'GET',
      { body: {} },
      {},
    );
    assert.notEqual(handled, false, 'handler claimed the route');
    assert.equal(captured.status, 200);
    assert.equal(captured.body.fieldKey, 'colors');
    assert.equal(captured.body.structure.meta.reserved, true);
    const ids = captured.body.structure.sections.map((s) => s.id);
    assert.ok(ids.includes('reserved-owner'), 'reserved-owner section present');
    // Reserved keys do not get a runtime prompt, so full-prompt is omitted.
    assert.ok(!ids.includes('full-prompt'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
