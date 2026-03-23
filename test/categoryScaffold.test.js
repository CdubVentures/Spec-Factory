import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scaffoldCategory, TEMPLATE_PRESETS } from '../src/field-rules/compilerCategoryInit.js';
import { loadCategoryConfig } from '../src/categories/loader.js';

async function withTempRoot(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-test-'));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function fileExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

describe('scaffoldCategory', () => {
  it('creates a valid category with compiled field rules', async () => {
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      const result = await scaffoldCategory({
        category: 'test_widget',
        config: { categoryAuthorityRoot: helperRoot },
      });

      assert.equal(result.created, true);
      assert.equal(result.category, 'test_widget');
      assert.equal(result.compileResult.compiled, true);
      assert.equal(result.compileResult.field_count > 0, true);
    });
  });

  it('produces a category loadable by loadCategoryConfig', async () => {
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      await scaffoldCategory({
        category: 'test_widget',
        config: { categoryAuthorityRoot: helperRoot },
      });

      const config = await loadCategoryConfig('test_widget', {
        config: { categoryAuthorityRoot: helperRoot },
      });

      assert.ok(config.fieldRules);
      assert.ok(config.fieldRules.fields);
      assert.equal(Object.keys(config.fieldRules.fields).length > 0, true);
    });
  });

  it('uses electronics template by default', async () => {
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      const result = await scaffoldCategory({
        category: 'test_widget',
        template: 'electronics',
        config: { categoryAuthorityRoot: helperRoot },
      });

      assert.equal(result.template, 'electronics');
      assert.equal(result.compileResult.compiled, true);
    });
  });

  it('falls back to electronics for unknown template', async () => {
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      const result = await scaffoldCategory({
        category: 'test_widget',
        template: 'nonexistent_template',
        config: { categoryAuthorityRoot: helperRoot },
      });

      assert.equal(result.created, true);
      assert.equal(result.compileResult.compiled, true);
      assert.equal(result.compileResult.field_count > 0, true);
    });
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
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      await scaffoldCategory({
        category: 'test_widget',
        config: { categoryAuthorityRoot: helperRoot },
      });

      const fieldRulesPath = path.join(helperRoot, 'test_widget', '_generated', 'field_rules.json');
      assert.equal(await fileExists(fieldRulesPath), true);

      const fieldRules = await readJson(fieldRulesPath);
      assert.ok(fieldRules.fields);
      assert.equal(typeof fieldRules.fields, 'object');
      assert.equal(Object.keys(fieldRules.fields).length > 0, true);
    });
  });

  it('creates control plane map for future recompilation', async () => {
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      await scaffoldCategory({
        category: 'test_widget',
        config: { categoryAuthorityRoot: helperRoot },
      });

      const mapPath = path.join(helperRoot, 'test_widget', '_control_plane', 'field_studio_map.json');
      assert.equal(await fileExists(mapPath), true);

      const map = await readJson(mapPath);
      assert.ok(Array.isArray(map.selected_keys));
      assert.equal(map.selected_keys.length > 0, true);
    });
  });

  it('selected_keys cover all template preset fields', async () => {
    await withTempRoot(async (root) => {
      const helperRoot = path.join(root, 'category_authority');
      await scaffoldCategory({
        category: 'test_widget',
        config: { categoryAuthorityRoot: helperRoot },
      });

      const mapPath = path.join(helperRoot, 'test_widget', '_control_plane', 'field_studio_map.json');
      const map = await readJson(mapPath);

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
          map.selected_keys.includes(key),
          `expected selected_keys to include '${key}'`
        );
      }
    });
  });
});
