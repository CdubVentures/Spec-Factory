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
        product_image_dependent: true,
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
    },
  }));
  await fs.writeFile(path.join(generated, 'known_values.json'), JSON.stringify({
    category: 'mouse',
    enums: { sensor: { policy: 'open_prefer_known', values: ['PMW3395'] } },
  }));
  await fs.writeFile(path.join(generated, 'field_groups.json'), JSON.stringify({
    group_index: { general: ['sensor'] },
  }));
  await fs.writeFile(path.join(generated, 'component_db', 'sensor.json'), JSON.stringify({
    component_type: 'sensor',
    items: [{ name: 'PMW3395', properties: { dpi: 26000 } }],
  }));
}

test('POST /category-audit/:category/generate-report writes both files and returns paths', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-report'], null, 'POST', { body: { consumer: 'key_finder' } }, {});
    assert.equal(captured.status, 200);
    assert.equal(captured.body.category, 'mouse');
    assert.equal(captured.body.consumer, 'key_finder');
    assert.ok(captured.body.htmlPath.endsWith(path.join('mouse', 'summary', 'mouse-key-finder-summary.html')));
    assert.ok(captured.body.mdPath.endsWith(path.join('mouse', 'summary', 'mouse-key-finder-summary.md')));
    const html = await fs.readFile(captured.body.htmlPath, 'utf8');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('Key Finder Summary'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST with missing category returns 400 unknown_category', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const reportsRoot = path.join(tmp, 'reports');
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  try {
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'nonexistent', 'generate-report'], null, 'POST', { body: {} }, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'unknown_category');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST with unknown consumer returns 400 unknown_consumer', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-report'], null, 'POST', { body: { consumer: 'indexing' } }, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'unknown_consumer');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('Handler returns false for unmatched routes so the dispatcher keeps iterating', async () => {
  // The request dispatcher treats `result !== false` as "handled". Returning
  // null from a handler would short-circuit every downstream handler. Guard
  // that contract here — regressions break unrelated routes (review, source
  // strategy, etc.) with silent 404s.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    const handler = registerCategoryAuditRoutes(ctx);
    assert.equal(await handler(['other-thing'], null, 'GET', {}, {}), false);
    assert.equal(await handler(['review', 'mouse', 'layout'], null, 'GET', {}, {}), false);
    assert.equal(await handler(['source-strategy'], null, 'GET', {}, {}), false);
    assert.equal(await handler(['category-audit', 'mouse'], null, 'GET', {}, {}), false, 'unmatched sub-path falls through');
    assert.equal(await handler(['category-audit', 'mouse', 'generate-report'], null, 'GET', {}, {}), false, 'wrong method falls through');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST with invalid JSON body returns 400 invalid_json_body', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx, captured } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    // Override readJsonBody to throw
    ctx.readJsonBody = async () => { throw new Error('bad json'); };
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-report'], null, 'POST', {}, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'invalid_json_body');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST /category-audit/:category/generate-per-key-docs writes the per-key tree and returns paths', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-per-key-docs'], null, 'POST', { body: {} }, {});
    assert.equal(captured.status, 200);
    assert.equal(captured.body.category, 'mouse');
    assert.ok(captured.body.basePath.includes('per-key'));
    assert.ok(captured.body.basePath.endsWith(path.join('mouse', 'per-key')));
    assert.ok(captured.body.counts.written >= 1);
    assert.ok(captured.body.reservedKeysPath.endsWith('_reserved-keys.md'));
    // Verify the sensor doc landed where we expect
    const sensorHtml = path.join(captured.body.basePath, 'general', 'sensor.html');
    const content = await fs.readFile(sensorHtml, 'utf8');
    assert.ok(content.startsWith('<!DOCTYPE html>'));
    assert.ok(content.includes('sensor'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST /category-audit/:category/generate-all-reports writes category and per-key reports', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const humanChangeFile = path.join(reportsRoot, 'mouse', 'auditors-responses', 'mouse-07-design.field-studio-patch.v1.json');
    await fs.mkdir(path.dirname(humanChangeFile), { recursive: true });
    await fs.writeFile(humanChangeFile, '{"schema_version":"field-studio-patch.v1"}', 'utf8');
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-all-reports'], null, 'POST', { body: { consumer: 'key_finder' } }, {});
    assert.equal(captured.status, 200);
    assert.equal(captured.body.category, 'mouse');
    assert.ok(captured.body.categoryReport.htmlPath.endsWith(path.join('mouse', 'summary', 'mouse-key-finder-summary.html')));
    assert.ok(captured.body.categoryReport.mdPath.endsWith(path.join('mouse', 'summary', 'mouse-key-finder-summary.md')));
    assert.ok(captured.body.perKeyDocs.basePath.endsWith(path.join('mouse', 'per-key')));
    assert.ok(captured.body.perKeyDocs.counts.written >= 1);
    assert.ok(captured.body.promptAudit.summary.mdPath.endsWith(path.join('mouse', 'summary', 'mouse-prompt-audit-summary.md')));
    assert.ok(captured.body.promptAudit.perPromptReports.basePath.endsWith(path.join('mouse', 'per-prompt')));
    assert.ok(captured.body.promptAudit.perPromptReports.count >= 8);

    const categoryMd = await fs.readFile(captured.body.categoryReport.mdPath, 'utf8');
    const sensorMd = await fs.readFile(path.join(captured.body.perKeyDocs.basePath, 'general', 'sensor.md'), 'utf8');
    const promptAuditMd = await fs.readFile(captured.body.promptAudit.summary.mdPath, 'utf8');
    assert.ok(categoryMd.includes('Product Image Dependent'));
    assert.ok(!categoryMd.includes('Full field contract authoring order'), 'category summary does not duplicate per-key scripts');
    assert.ok(sensorMd.includes('Full field contract authoring order'));
    assert.ok(promptAuditMd.includes('Prompt Surface Matrix'));
    assert.equal(await fs.readFile(humanChangeFile, 'utf8'), '{"schema_version":"field-studio-patch.v1"}');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST /category-audit/:category/generate-prompt-audit writes category and per-prompt prompt reports', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  const reportsRoot = path.join(tmp, 'reports');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    await fs.writeFile(path.join(categoryAuthorityRoot, 'mouse', 'product_images_settings.json'), JSON.stringify({
      viewBudget: '["top","left"]',
      priorityViewPrompt_top: 'Route fixture top prompt',
    }));
    const { ctx, captured } = mockCtx({ reportsRoot, categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-prompt-audit'], null, 'POST', { body: {} }, {});
    assert.equal(captured.status, 200);
    assert.equal(captured.body.category, 'mouse');
    assert.ok(captured.body.summary.mdPath.endsWith(path.join('mouse', 'summary', 'mouse-prompt-audit-summary.md')));
    assert.ok(captured.body.perPromptReports.basePath.endsWith(path.join('mouse', 'per-prompt')));
    assert.ok(captured.body.perPromptReports.count >= 8);

    const pifView = await fs.readFile(path.join(captured.body.perPromptReports.basePath, 'pif', 'view-search.md'), 'utf8');
    assert.ok(pifView.includes('Route fixture top prompt'));
    assert.ok(pifView.includes('{{PRODUCT_IMAGE_IDENTITY_FACTS}}'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST generate-all-reports with missing category returns 400 unknown_category', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx, captured } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'nonexistent', 'generate-all-reports'], null, 'POST', { body: {} }, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'unknown_category');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST generate-all-reports with unknown consumer returns 400 unknown_consumer', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  const categoryAuthorityRoot = path.join(tmp, 'category_authority');
  try {
    await setupFixtureCategory(path.join(categoryAuthorityRoot, 'mouse'));
    const { ctx, captured } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-all-reports'], null, 'POST', { body: { consumer: 'indexing' } }, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'unknown_consumer');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST generate-all-reports with invalid JSON body returns 400 invalid_json_body', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx, captured } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    ctx.readJsonBody = async () => { throw new Error('bad json'); };
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'mouse', 'generate-all-reports'], null, 'POST', {}, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'invalid_json_body');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('generate-all-reports returns false for non-POST', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    const handler = registerCategoryAuditRoutes(ctx);
    assert.equal(await handler(['category-audit', 'mouse', 'generate-all-reports'], null, 'GET', {}, {}), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('POST generate-per-key-docs with unknown category returns 400', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx, captured } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    const handler = registerCategoryAuditRoutes(ctx);
    await handler(['category-audit', 'nonexistent', 'generate-per-key-docs'], null, 'POST', { body: {} }, {});
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, 'unknown_category');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('generate-per-key-docs returns false for non-POST and other sub-paths', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-routes-'));
  try {
    const { ctx } = mockCtx({ reportsRoot: path.join(tmp, 'reports'), categoryAuthorityRoot: path.join(tmp, 'category_authority') });
    const handler = registerCategoryAuditRoutes(ctx);
    assert.equal(await handler(['category-audit', 'mouse', 'generate-per-key-docs'], null, 'GET', {}, {}), false, 'wrong method falls through');
    assert.equal(await handler(['category-audit', 'mouse', 'unknown-path'], null, 'POST', {}, {}), false, 'unknown sub-path falls through');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
