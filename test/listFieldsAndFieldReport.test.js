import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listFields, fieldReport } from '../src/field-rules/compiler.js';

function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'listfields-test-'));
}

async function scaffoldCategory(tmpDir, category, fieldRules, uiFieldCatalog) {
  const generatedRoot = path.join(tmpDir, category, '_generated');
  await fs.mkdir(generatedRoot, { recursive: true });
  await fs.writeFile(
    path.join(generatedRoot, 'field_rules.json'),
    JSON.stringify(fieldRules, null, 2),
    'utf8'
  );
  if (uiFieldCatalog) {
    await fs.writeFile(
      path.join(generatedRoot, 'ui_field_catalog.json'),
      JSON.stringify(uiFieldCatalog, null, 2),
      'utf8'
    );
  }
}

const SAMPLE_FIELD_RULES = {
  category: 'test_device',
  generated_at: '2026-01-01T00:00:00.000Z',
  fields: {
    brand: {
      field_key: 'brand',
      display_name: 'Brand',
      group: 'identity',
      data_type: 'string',
      output_shape: 'scalar',
      required_level: 'required',
      availability: 'expected',
      difficulty: 'easy',
      effort: 2,
      evidence_required: true,
      unknown_reason_default: 'not_found_after_search',
      priority: { required_level: 'required', availability: 'expected', difficulty: 'easy', effort: 2 },
      contract: { type: 'string', shape: 'scalar' },
      evidence: { required: true }
    },
    weight: {
      field_key: 'weight',
      display_name: 'Weight',
      group: 'physical',
      data_type: 'number',
      output_shape: 'scalar',
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'medium',
      effort: 3,
      evidence_required: true,
      unknown_reason_default: 'not_found_after_search',
      priority: { required_level: 'expected', availability: 'expected', difficulty: 'medium', effort: 3 },
      contract: { type: 'number', shape: 'scalar', unit: 'g' },
      evidence: { required: true }
    },
    dpi: {
      field_key: 'dpi',
      display_name: 'DPI',
      group: 'performance',
      data_type: 'number',
      output_shape: 'scalar',
      required_level: 'critical',
      availability: 'expected',
      difficulty: 'easy',
      effort: 2,
      evidence_required: true,
      unknown_reason_default: 'not_found_after_search',
      priority: { required_level: 'critical', availability: 'expected', difficulty: 'easy', effort: 2 },
      contract: { type: 'number', shape: 'scalar' },
      evidence: { required: true }
    }
  }
};

const SAMPLE_UI_CATALOG = {
  fields: [
    { key: 'brand', label: 'Brand Name', group: 'Identity', section: 'identity' },
    { key: 'weight', label: 'Weight (g)', group: 'Physical', section: 'physical' },
    { key: 'dpi', label: 'Max DPI', group: 'Performance', section: 'performance' }
  ]
};

describe('listFields', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await makeTempDir();
    await scaffoldCategory(tmpDir, 'test_device', SAMPLE_FIELD_RULES, SAMPLE_UI_CATALOG);
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns field array for a compiled category', async () => {
    const result = await listFields({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir }
    });
    assert.equal(result.category, 'test_device');
    assert.equal(result.count, 3);
    assert.equal(Array.isArray(result.fields), true);
    const keys = result.fields.map((f) => f.key);
    assert.deepEqual(keys, ['brand', 'dpi', 'weight']);
  });

  it('returns fields with expected shape', async () => {
    const result = await listFields({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir }
    });
    const brand = result.fields.find((f) => f.key === 'brand');
    assert.equal(brand.display_name, 'Brand Name');
    assert.equal(brand.group, 'Identity');
    assert.equal(brand.required_level, 'required');
    assert.equal(brand.data_type, 'string');
    assert.equal(brand.output_shape, 'scalar');
  });

  it('filters by group', async () => {
    const result = await listFields({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir },
      group: 'identity'
    });
    assert.equal(result.count, 1);
    assert.equal(result.fields[0].key, 'brand');
  });

  it('filters by requiredLevel', async () => {
    const result = await listFields({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir },
      requiredLevel: 'critical'
    });
    assert.equal(result.count, 1);
    assert.equal(result.fields[0].key, 'dpi');
  });

  it('returns empty for non-existent category', async () => {
    await assert.rejects(
      () => listFields({
        category: 'nonexistent',
        config: { categoryAuthorityRoot: tmpDir }
      }),
      (err) => err.message.includes('missing_or_invalid')
    );
  });

  it('throws for empty category', async () => {
    await assert.rejects(
      () => listFields({ category: '', config: { categoryAuthorityRoot: tmpDir } }),
      (err) => err.message === 'category_required'
    );
  });

  it('includes unit from contract', async () => {
    const result = await listFields({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir }
    });
    const weight = result.fields.find((f) => f.key === 'weight');
    assert.equal(weight.unit, 'g');
  });
});

describe('fieldReport', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await makeTempDir();
    await scaffoldCategory(tmpDir, 'test_device', SAMPLE_FIELD_RULES, SAMPLE_UI_CATALOG);
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns JSON format', async () => {
    const result = await fieldReport({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir },
      format: 'json'
    });
    assert.equal(result.category, 'test_device');
    assert.equal(result.format, 'json');
    assert.equal(result.field_count, 3);
    assert.equal(Array.isArray(result.groups), true);
    assert.equal(Array.isArray(result.fields), true);
  });

  it('returns markdown format', async () => {
    const result = await fieldReport({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir },
      format: 'md'
    });
    assert.equal(result.category, 'test_device');
    assert.equal(result.format, 'md');
    assert.equal(typeof result.report, 'string');
    assert.ok(result.report.includes('# Field Report: test_device'));
    assert.ok(result.report.includes('Total fields: 3'));
    assert.ok(result.report.includes('| brand |'));
  });

  it('defaults to markdown format', async () => {
    const result = await fieldReport({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir }
    });
    assert.equal(result.format, 'md');
    assert.equal(typeof result.report, 'string');
  });

  it('JSON format groups include counts', async () => {
    const result = await fieldReport({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir },
      format: 'json'
    });
    const identityGroup = result.groups.find((g) => g.group === 'Identity');
    assert.ok(identityGroup);
    assert.equal(identityGroup.count, 1);
    assert.equal(identityGroup.required, 1);
    const perfGroup = result.groups.find((g) => g.group === 'Performance');
    assert.ok(perfGroup);
    assert.equal(perfGroup.critical, 1);
  });

  it('markdown format includes group summary table', async () => {
    const result = await fieldReport({
      category: 'test_device',
      config: { categoryAuthorityRoot: tmpDir },
      format: 'md'
    });
    assert.ok(result.report.includes('## Group Summary'));
    assert.ok(result.report.includes('## Fields'));
    assert.ok(result.report.includes('| Key | Display Name |'));
  });
});
