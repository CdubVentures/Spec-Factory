import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scaffoldCategory, TEMPLATE_PRESETS } from '../compilerCategoryInit.js';
import { loadCategoryConfig } from '../../categories/loader.js';

async function fileExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

describe('scaffoldCategory', () => {
  let root = '';
  let helperRoot = '';
  let defaultResult = null;
  let defaultConfig = null;
  let defaultFieldRulesPath = '';
  let defaultFieldRules = null;
  let defaultMapPath = '';
  let defaultMap = null;
  let explicitTemplateResult = null;
  let fallbackTemplateResult = null;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-test-'));
    helperRoot = path.join(root, 'category_authority');

    defaultResult = await scaffoldCategory({
      category: 'test_widget',
      config: { categoryAuthorityRoot: helperRoot },
    });
    defaultConfig = await loadCategoryConfig('test_widget', {
      config: { categoryAuthorityRoot: helperRoot },
    });
    defaultFieldRulesPath = path.join(helperRoot, 'test_widget', '_generated', 'field_rules.json');
    defaultFieldRules = await readJson(defaultFieldRulesPath);
    defaultMapPath = path.join(helperRoot, 'test_widget', '_control_plane', 'field_studio_map.json');
    defaultMap = await readJson(defaultMapPath);

    explicitTemplateResult = await scaffoldCategory({
      category: 'electronics_widget',
      template: 'electronics',
      config: { categoryAuthorityRoot: helperRoot },
    });
    fallbackTemplateResult = await scaffoldCategory({
      category: 'fallback_widget',
      template: 'nonexistent_template',
      config: { categoryAuthorityRoot: helperRoot },
    });
  });

  after(async () => {
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('creates a valid category with compiled field rules', async () => {
    assert.equal(defaultResult.created, true);
    assert.equal(defaultResult.category, 'test_widget');
    assert.equal(defaultResult.compileResult.compiled, true);
    assert.equal(defaultResult.compileResult.field_count > 0, true);
  });

  it('produces a category loadable by loadCategoryConfig', async () => {
    assert.ok(defaultConfig.fieldRules);
    assert.ok(defaultConfig.fieldRules.fields);
    assert.equal(Object.keys(defaultConfig.fieldRules.fields).length > 0, true);
  });

  it('uses electronics template when template is omitted', async () => {
    assert.equal(defaultResult.template, 'electronics');
    assert.equal(defaultResult.compileResult.compiled, true);
  });

  it('uses the electronics template explicitly', async () => {
    assert.equal(explicitTemplateResult.template, 'electronics');
    assert.equal(explicitTemplateResult.compileResult.compiled, true);
  });

  it('falls back to electronics for unknown template', async () => {
    assert.equal(fallbackTemplateResult.created, true);
    assert.equal(fallbackTemplateResult.compileResult.compiled, true);
    assert.equal(fallbackTemplateResult.compileResult.field_count > 0, true);
  });

  it('throws for empty category', async () => {
    await assert.rejects(
      () => scaffoldCategory({ category: '' }),
      (err) => err instanceof Error
    );
  });

  it('throws for null category', async () => {
    await assert.rejects(
      () => scaffoldCategory({ category: null }),
      (err) => err instanceof Error
    );
  });

  it('generates field_rules.json with fields object', async () => {
    assert.equal(await fileExists(defaultFieldRulesPath), true);
    assert.ok(defaultFieldRules.fields);
    assert.equal(typeof defaultFieldRules.fields, 'object');
    assert.equal(Object.keys(defaultFieldRules.fields).length > 0, true);
  });

  it('creates control plane map for future recompilation', async () => {
    assert.equal(await fileExists(defaultMapPath), true);
    assert.ok(Array.isArray(defaultMap.selected_keys));
    assert.equal(defaultMap.selected_keys.length > 0, true);
  });

  it('selected_keys cover all template preset fields', async () => {
    const preset = TEMPLATE_PRESETS.electronics;
    const expectedKeys = [
      ...preset.common_identity,
      ...preset.common_physical,
      ...preset.common_connectivity,
      ...preset.common_editorial,
      ...preset.common_commerce,
      ...preset.common_media,
    ];

    for (const key of expectedKeys) {
      assert.ok(
        defaultMap.selected_keys.includes(key),
        `expected selected_keys to include '${key}'`
      );
    }
  });
});
