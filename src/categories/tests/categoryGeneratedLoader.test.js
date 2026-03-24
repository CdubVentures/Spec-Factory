import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCategoryConfig } from '../loader.js';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('loadCategoryConfig derives schema and required fields from category_authority/_generated field rules', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-generated-loader-'));
  const helperRoot = path.join(root, 'category_authority');
  const category = 'mouse';
  try {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      version: 1,
      schema: {
        required_fields: ['connection'],
        critical_fields: ['weight'],
        expected_easy_fields: ['dpi'],
        expected_sometimes_fields: [],
        deep_fields: []
      },
      fields: {
        connection: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'string',
          shape: 'scalar'
        },
        weight: {
          required_level: 'critical',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'number',
          shape: 'scalar',
          unit: 'g'
        },
        dpi: {
          required_level: 'expected',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'number',
          shape: 'scalar',
          unit: 'dpi'
        }
      }
    });
    await writeJson(path.join(helperRoot, category, '_generated', 'ui_field_catalog.json'), {
      version: 1,
      category,
      fields: [
        { key: 'connection', order: 1 },
        { key: 'weight', order: 2 },
        { key: 'dpi', order: 3 }
      ]
    });

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot
      }
    });
    assert.deepEqual(config.fieldOrder, ['connection', 'weight', 'dpi']);
    assert.equal(config.requiredFields.includes('fields.connection'), true);
    assert.equal(config.requiredFields.includes('fields.weight'), true);
    assert.equal(config.criticalFieldSet.has('weight'), true);
    assert.equal(String(config.fieldRules?.__meta?.file_path || '').includes('_generated'), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadCategoryConfig prefers category_authority category config over legacy categories fallback', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-generated-loader-authority-base-'));
  const helperRoot = path.join(root, 'category_authority');
  const categoriesRoot = path.join(root, 'categories');
  const category = 'monitor';
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      version: 1,
      fields: {
        brightness: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'number',
          shape: 'scalar'
        }
      }
    });
    await writeJson(path.join(helperRoot, category, 'schema.json'), {
      category,
      field_order: ['brightness'],
      critical_fields: ['brightness'],
      expected_easy_fields: ['brightness'],
      expected_sometimes_fields: [],
      deep_fields: [],
      editorial_fields: [],
      targets: {
        targetCompleteness: 0.97,
        targetConfidence: 0.93
      }
    });
    await writeJson(path.join(helperRoot, category, 'required_fields.json'), ['fields.brightness']);
    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      approved: {
        manufacturer: ['authority.example.com'],
        lab: [],
        database: [],
        retailer: []
      },
      denylist: ['authority-deny.example.com'],
      sources: {}
    });
    await writeJson(path.join(helperRoot, category, 'anchors.json'), {
      panel_type: ['ips']
    });
    await writeJson(path.join(helperRoot, category, 'search_templates.json'), [
      {
        label: 'authority template',
        query: '{brand} {model} brightness'
      }
    ]);

    await writeJson(path.join(categoriesRoot, category, 'schema.json'), {
      category,
      field_order: ['legacy_field'],
      critical_fields: ['legacy_field'],
      expected_easy_fields: [],
      expected_sometimes_fields: [],
      deep_fields: [],
      editorial_fields: [],
      targets: {
        targetCompleteness: 0.11,
        targetConfidence: 0.22
      }
    });
    await writeJson(path.join(categoriesRoot, category, 'required_fields.json'), ['fields.legacy_field']);
    await writeJson(path.join(categoriesRoot, category, 'sources.json'), {
      approved: {
        manufacturer: ['legacy.example.com'],
        lab: [],
        database: [],
        retailer: []
      },
      denylist: ['legacy-deny.example.com'],
      sources: {}
    });
    await writeJson(path.join(categoriesRoot, category, 'anchors.json'), {
      legacy_anchor: ['tn']
    });
    await writeJson(path.join(categoriesRoot, category, 'search_templates.json'), [
      {
        label: 'legacy template',
        query: '{brand} {model} legacy'
      }
    ]);

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      }
    });

    assert.deepEqual(config.fieldOrder, ['brightness']);
    assert.equal(config.criticalFieldSet.has('brightness'), true);
    assert.equal(config.criticalFieldSet.has('legacy_field'), false);
    assert.deepEqual(config.requiredFields, ['fields.brightness']);
    assert.equal(config.sourceHostMap.has('authority.example.com'), true);
    assert.equal(config.sourceHostMap.has('legacy.example.com'), false);
    assert.deepEqual(config.anchorFields, { panel_type: ['ips'] });
    assert.deepEqual(config.searchTemplates, [{ label: 'authority template', query: '{brand} {model} brightness' }]);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});
