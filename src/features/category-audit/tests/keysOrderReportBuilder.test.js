import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { generateKeysOrderAuditReport } from '../keysOrderReportBuilder.js';

function mkRule(over = {}) {
  return {
    priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'medium' },
    contract: { type: 'string', shape: 'scalar' },
    enum: { policy: 'open', values: [] },
    ui: { label: 'Field' },
    aliases: [],
    search_hints: { domain_hints: [], query_terms: [] },
    ai_assist: { reasoning_note: '' },
    ...over,
  };
}

function loadedRulesFixture() {
  return {
    rules: {
      fields: {
        sku: mkRule({ ui: { label: 'SKU', group: 'product_variants' } }),
        dpi: mkRule({
          ui: { label: 'Max DPI', group: 'sensor_performance' },
          priority: { required_level: 'mandatory', availability: 'always', difficulty: 'medium' },
          contract: { type: 'number', shape: 'scalar', unit: 'dpi' },
          component: { type: 'sensor', relation: 'child', source: 'component_db.sensor' },
        }),
        ips: mkRule({
          ui: { label: 'IPS', group: 'sensor_performance' },
          contract: { type: 'number', shape: 'scalar', unit: 'ips' },
        }),
      },
    },
    knownValues: { enums: {} },
    componentDBs: {},
  };
}

const fieldGroups = {
  group_index: {
    product_variants: ['sku'],
    sensor_performance: ['dpi', 'ips'],
  },
};

const fieldKeyOrder = [
  '__grp::Product & Variants',
  'sku',
  '__grp::Sensor Performance',
  'dpi',
  'ips',
];

test('generateKeysOrderAuditReport writes keys-order HTML, Markdown, and prompt files', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'keys-order-report-'));
  try {
    const result = await generateKeysOrderAuditReport({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups,
      fieldKeyOrder,
      outputRoot,
      now: new Date('2026-04-28T00:00:00Z'),
    });

    assert.equal(result.basePath, path.join(outputRoot, 'mouse', 'keys-order'));
    assert.equal(result.htmlPath, path.join(result.basePath, 'mouse-keys-order-audit.html'));
    assert.equal(result.mdPath, path.join(result.basePath, 'mouse-keys-order-audit.md'));
    assert.equal(result.promptPath, path.join(result.basePath, 'mouse-keys-order-prompt.md'));

    const html = await fs.readFile(result.htmlPath, 'utf8');
    const md = await fs.readFile(result.mdPath, 'utf8');
    const prompt = await fs.readFile(result.promptPath, 'utf8');

    assert.match(html, /Keys Order Audit/);
    assert.match(md, /Current `field_key_order\.json` Groups/);
    assert.match(md, /Max DPI/);
    assert.match(md, /sensor_performance/);
    assert.match(md, /Missing-Key Discovery Checklist/);
    assert.match(md, /key-order-patch\.v1/);
    assert.match(prompt, /schema_version/);
    assert.match(prompt, /Never delete existing keys/i);
    assert.match(prompt, /same depth as the current mouse category/i);
    await fs.access(path.join(outputRoot, 'mouse', 'auditors-responses'));
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generateKeysOrderAuditReport archives the previous keys-order folder on regeneration', async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'keys-order-report-'));
  try {
    await generateKeysOrderAuditReport({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups,
      fieldKeyOrder,
      outputRoot,
      now: new Date('2026-04-01T00:00:00Z'),
    });

    await generateKeysOrderAuditReport({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups,
      fieldKeyOrder,
      outputRoot,
      now: new Date('2026-04-02T00:00:00Z'),
    });

    const archived = await fs.readFile(
      path.join(outputRoot, 'mouse', 'archive', '2026-04-02T00-00-00-000Z', 'keys-order', 'mouse-keys-order-audit.md'),
      'utf8',
    );
    assert.match(archived, /2026-04-01T00:00:00\.000Z/);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});
