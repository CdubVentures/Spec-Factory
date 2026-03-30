import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadCategoryConfig } from '../loader.js';
import { withTempCategoryRoots, writeJson } from './helpers/categoryLoaderHarness.js';

test('loadCategoryConfig derives schema and required fields from category_authority/_generated field rules', async () => {
  const category = 'mouse';

  await withTempCategoryRoots('spec-harvester-generated-loader-', async ({ helperRoot }) => {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      version: 1,
      schema: {
        required_fields: ['connection'],
        critical_fields: ['weight'],
        expected_easy_fields: ['dpi'],
        expected_sometimes_fields: [],
        deep_fields: [],
      },
      fields: {
        connection: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'string',
          shape: 'scalar',
        },
        weight: {
          required_level: 'critical',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'number',
          shape: 'scalar',
          unit: 'g',
        },
        dpi: {
          required_level: 'expected',
          availability: 'expected',
          difficulty: 'easy',
          effort: 3,
          type: 'number',
          shape: 'scalar',
          unit: 'dpi',
        },
      },
    });
    await writeJson(path.join(helperRoot, category, '_generated', 'ui_field_catalog.json'), {
      version: 1,
      category,
      fields: [
        { key: 'connection', order: 1 },
        { key: 'weight', order: 2 },
        { key: 'dpi', order: 3 },
      ],
    });

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.deepEqual(config.fieldOrder, ['connection', 'weight', 'dpi']);
    assert.deepEqual(config.requiredFields, ['fields.connection', 'fields.weight']);
    assert.deepEqual(config.schema, {
      category,
      field_order: ['connection', 'weight', 'dpi'],
      critical_fields: ['weight'],
      expected_easy_fields: ['connection', 'weight', 'dpi'],
      expected_sometimes_fields: [],
      deep_fields: [],
      editorial_fields: [],
      targets: {
        targetCompleteness: 0.9,
        targetConfidence: 0.8,
      },
    });
    assert.deepEqual([...config.criticalFieldSet], ['weight']);
    assert.equal(
      config.fieldRules?.__meta?.file_path,
      path.join(helperRoot, category, '_generated', 'field_rules.json'),
    );
    assert.equal(config.generated_schema_path, null);
    assert.equal(config.generated_required_fields_path, null);
  });
});

test('loadCategoryConfig prefers category_authority category config over legacy categories fallback', async () => {
  const category = 'monitor';

  await withTempCategoryRoots('spec-harvester-generated-loader-authority-base-', async ({ root, helperRoot, categoriesRoot }) => {
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
          shape: 'scalar',
        },
      },
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
        targetConfidence: 0.93,
      },
      required_fields: ['fields.brightness'],
      anchor_fields: { panel_type: ['ips'] },
      search_templates: [
        { label: 'authority template', query: '{brand} {model} brightness' },
      ],
    });
    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      approved: {
        manufacturer: ['authority.example.com'],
        lab: [],
        database: [],
        retailer: [],
      },
      denylist: ['authority-deny.example.com'],
      sources: {},
    });

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
        targetConfidence: 0.22,
      },
      required_fields: ['fields.legacy_field'],
      anchor_fields: { legacy_anchor: ['tn'] },
      search_templates: [
        { label: 'legacy template', query: '{brand} {model} legacy' },
      ],
    });
    await writeJson(path.join(categoriesRoot, category, 'sources.json'), {
      approved: {
        manufacturer: ['legacy.example.com'],
        lab: [],
        database: [],
        retailer: [],
      },
      denylist: ['legacy-deny.example.com'],
      sources: {},
    });

    const config = await loadCategoryConfig(category, {
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot,
      },
    });

    assert.deepEqual(config.fieldOrder, ['brightness']);
    assert.equal(config.criticalFieldSet.has('brightness'), true);
    assert.equal(config.criticalFieldSet.has('legacy_field'), false);
    assert.deepEqual(config.requiredFields, ['fields.brightness']);
    assert.deepEqual(config.schema.targets, {
      targetCompleteness: 0.97,
      targetConfidence: 0.93,
    });
    assert.equal(config.sourceHostMap.has('authority.example.com'), true);
    assert.equal(config.sourceHostMap.has('legacy.example.com'), false);
    assert.equal(config.sourceHostMap.get('authority.example.com').tierName, 'manufacturer');
    assert.deepEqual(config.denylist, ['authority-deny.example.com']);
    assert.deepEqual(config.anchorFields, { panel_type: ['ips'] });
    assert.deepEqual(config.searchTemplates, [{ label: 'authority template', query: '{brand} {model} brightness' }]);
    assert.deepEqual(
      config.approvedRootDomains,
      new Set(['example.com']),
    );
    assert.equal(
      config.generated_schema_path,
      path.join(helperRoot, category, 'schema.json'),
    );
    assert.equal(config.generated_required_fields_path, null);
  });
});

