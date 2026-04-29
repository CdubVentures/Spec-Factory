import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { generateCategoryAuditReport } from '../reportBuilder.js';

function fixtureLoadedRules() {
  return {
    rules: {
      fields: {
        sensor: {
          field_key: 'sensor',
          display_name: 'Sensor',
          product_image_dependent: true,
          priority: { required_level: 'mandatory', availability: 'always', difficulty: 'hard' },
          contract: { type: 'string', shape: 'scalar' },
          enum: { policy: 'open_prefer_known', source: 'data_lists.sensor', values: [] },
          aliases: [],
          search_hints: { domain_hints: [], query_terms: [], content_types: [], preferred_tiers: [] },
          constraints: [],
          component: { type: 'sensor', source: 'component_db.sensor' },
          ai_assist: { reasoning_note: '' },
          evidence: { min_evidence_refs: 1, tier_preference: [] },
          group: 'general',
          ui: { label: 'Sensor', group: 'General' },
        },
      },
    },
    knownValues: { enums: { sensor: { policy: 'open_prefer_known', values: ['PMW3395'] } } },
    componentDBs: { sensor: { items: [{ name: 'PMW3395', properties: { dpi: 26000 } }] } },
  };
}

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'category-audit-test-'));
}

test('generateCategoryAuditReport writes compact HTML + MD summary inside the category summary folder', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generateCategoryAuditReport({
      category: 'mouse',
      consumer: 'key_finder',
      loadedRules: fixtureLoadedRules(),
      fieldGroups: { group_index: { general: ['sensor'] } },
      globalFragments: { evidenceContract: 'evidence' },
      tierBundles: { fallback: { model: 'claude-sonnet-4-6' } },
      outputRoot,
      now: new Date('2026-04-22T12:00:00Z'),
    });
    assert.equal(result.htmlPath, path.join(outputRoot, 'mouse', 'summary', 'mouse-key-finder-summary.html'));
    assert.equal(result.mdPath, path.join(outputRoot, 'mouse', 'summary', 'mouse-key-finder-summary.md'));
    assert.equal(result.generatedAt, '2026-04-22T12:00:00.000Z');
    const html = await fs.readFile(result.htmlPath, 'utf8');
    const md = await fs.readFile(result.mdPath, 'utf8');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('Key Finder Summary'));
    assert.ok(md.includes('## Audit Context'));
    assert.ok(md.includes('## Matrix Legend'));
    assert.ok(md.includes('## Final Signoff Checklist'));
    assert.ok(md.includes('## Auditor Return Format'));
    assert.ok(md.includes('Disagreements with per-key returned audits'));
    assert.ok(md.includes('Category-level corrections'));
    assert.ok(md.includes('Keys requiring re-audit'));
    assert.ok(md.includes('Priority = `M/N / availability / difficulty`'));
    assert.ok(md.includes('Unknown / no / n/a'));
    assert.ok(md.includes('component `_link` fields'));
    assert.ok(md.includes('| Key | Group | Priority | Contract | Enum | Component | Evidence | Dependencies | Readiness |'));
    assert.ok(md.includes('Product Image Dependent'));
    assert.ok(md.includes('`sensor`'));
    assert.ok(!md.includes('Full field contract authoring order'), 'category summary does not duplicate per-key scripts');
    await fs.access(path.join(outputRoot, 'mouse', 'auditors-responses'));
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generateCategoryAuditReport overwrites only its own summary files without wiping auditor response patches', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const categoryReportFolder = path.join(outputRoot, 'mouse', 'auditors-responses');
    await fs.mkdir(categoryReportFolder, { recursive: true });
    const humanChangeFile = path.join(categoryReportFolder, 'mouse-07-design.field-studio-patch.v1.json');
    await fs.writeFile(humanChangeFile, '{"schema_version":"field-studio-patch.v1"}', 'utf8');

    const first = await generateCategoryAuditReport({
      category: 'mouse',
      loadedRules: fixtureLoadedRules(),
      fieldGroups: { group_index: { general: ['sensor'] } },
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-22T12:00:00Z'),
    });
    const second = await generateCategoryAuditReport({
      category: 'mouse',
      loadedRules: fixtureLoadedRules(),
      fieldGroups: { group_index: { general: ['sensor'] } },
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-22T13:00:00Z'),
    });
    assert.equal(first.htmlPath, second.htmlPath, 'same filename across runs');
    assert.equal(await fs.readFile(humanChangeFile, 'utf8'), '{"schema_version":"field-studio-patch.v1"}');
    const md = await fs.readFile(second.mdPath, 'utf8');
    assert.ok(md.includes('2026-04-22T13:00:00.000Z'), 'later run overwrites timestamp');
    assert.ok(!md.includes('2026-04-22T12:00:00.000Z'), 'earlier timestamp gone');
    await assert.rejects(
      fs.stat(path.join(outputRoot, 'mouse-key-finder-audit.md')),
      /ENOENT/,
      'legacy root-level giant audit is not regenerated',
    );
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generateCategoryAuditReport rejects unknown consumer', async () => {
  const outputRoot = await mkTmpDir();
  try {
    await assert.rejects(
      generateCategoryAuditReport({
        category: 'mouse',
        consumer: 'indexing',
        loadedRules: fixtureLoadedRules(),
        fieldGroups: { group_index: {} },
        globalFragments: {},
        tierBundles: {},
        outputRoot,
      }),
      /unknown consumer/,
    );
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generateCategoryAuditReport rejects missing category / outputRoot', async () => {
  await assert.rejects(
    generateCategoryAuditReport({ loadedRules: fixtureLoadedRules(), fieldGroups: {}, globalFragments: {}, tierBundles: {}, outputRoot: '/tmp' }),
    /category is required/,
  );
  await assert.rejects(
    generateCategoryAuditReport({ category: 'mouse', loadedRules: fixtureLoadedRules(), fieldGroups: {}, globalFragments: {}, tierBundles: {} }),
    /outputRoot is required/,
  );
});

test('generateCategoryAuditReport creates outputRoot if absent', async () => {
  const parent = await mkTmpDir();
  const outputRoot = path.join(parent, 'nested', 'reports');
  try {
    const result = await generateCategoryAuditReport({
      category: 'mouse',
      loadedRules: fixtureLoadedRules(),
      fieldGroups: { group_index: { general: ['sensor'] } },
      globalFragments: {},
      tierBundles: {},
      outputRoot,
    });
    const stat = await fs.stat(result.htmlPath);
    assert.ok(stat.size > 0);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
