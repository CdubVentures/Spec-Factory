import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  compileRules,
  initCategory,
  normalizeFieldRulesForPhase1,
  validateRules
} from '../compiler.js';
import { EG_LOCKED_KEYS } from '../../features/studio/index.js';
import {
  buildMouseWorkbookMap,
  buildMouseWorkbookMapWithOverrides,
  createCompilerWorkspace,
  createMouseWorkbookPath,
  pathExists,
  removeRoot,
} from './helpers/fieldRulesCompilerHarness.js';

async function createCompiledMouseBaseline() {
  const workspace = await createCompilerWorkspace('phase1-compiler-baseline-');
  const workbookPath = createMouseWorkbookPath(workspace.root);
  const workbookMap = buildMouseWorkbookMap(workbookPath);
  const compileResult = await compileRules({
    category: 'mouse',
    fieldStudioSourcePath: workbookPath,
    fieldStudioMap: workbookMap,
    config: {
      categoryAuthorityRoot: workspace.helperRoot,
      categoriesRoot: workspace.categoriesRoot
    }
  });
  process.once('exit', () => {
    fsSync.rmSync(workspace.root, { recursive: true, force: true });
  });
  return {
    ...workspace,
    workbookPath,
    workbookMap,
    compileResult,
  };
}

let compiledMouseBaselinePromise = null;

function getCompiledMouseBaseline() {
  if (!compiledMouseBaselinePromise) {
    compiledMouseBaselinePromise = createCompiledMouseBaseline();
  }
  return compiledMouseBaselinePromise;
}

async function cloneCompiledMouseBaseline(prefix) {
  const baseline = await getCompiledMouseBaseline();
  const workspace = await createCompilerWorkspace(prefix);
  if (await pathExists(baseline.helperRoot)) {
    await fs.cp(baseline.helperRoot, workspace.helperRoot, { recursive: true });
  }
  await fs.mkdir(workspace.categoriesRoot, { recursive: true });
  if (await pathExists(baseline.categoriesRoot)) {
    await fs.cp(baseline.categoriesRoot, workspace.categoriesRoot, { recursive: true });
  }
  return workspace;
}

test('compileRules writes Phase 1 generated artifacts and validateRules passes', async () => {
  const { compileResult, helperRoot, categoriesRoot } = await getCompiledMouseBaseline();
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
  assert.equal(compileResult.compiled, true);
  assert.equal(Array.isArray(compileResult.phase1_artifacts), true);
  assert.equal(compileResult.phase1_artifacts.length >= 8, true);

  assert.equal(await pathExists(path.join(generatedRoot, 'field_rules.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'ui_field_catalog.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'known_values.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'parse_templates.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'cross_validation_rules.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'field_groups.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'key_migrations.json')), true);
  assert.equal(await pathExists(path.join(generatedRoot, 'component_db')), true);

  const validation = await validateRules({
    category: 'mouse',
    config: {
      categoryAuthorityRoot: helperRoot,
      categoriesRoot
    }
  });
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.stats.field_count > 0, true);
  assert.equal(validation.stats.schema_artifacts_validated >= 5, true);
  assert.equal(validation.schema.valid, true);
});

test('compileRules dry-run reports no diff after stable compile', async () => {
  const { helperRoot, categoriesRoot, workbookPath, workbookMap } = await getCompiledMouseBaseline();
  const dryRun = await compileRules({
    category: 'mouse',
    fieldStudioSourcePath: workbookPath,
    fieldStudioMap: workbookMap,
    dryRun: true,
    config: {
      categoryAuthorityRoot: helperRoot,
      categoriesRoot
    }
  });
  assert.equal(dryRun.dry_run, true);
  assert.equal(dryRun.would_change, false);
});

test('compileRules dry-run uses existing control-plane map when workbookMap is not provided', async () => {
  const { helperRoot, categoriesRoot } = await getCompiledMouseBaseline();
  const dryRun = await compileRules({
    category: 'mouse',
    dryRun: true,
    config: {
      categoryAuthorityRoot: helperRoot,
      categoriesRoot
    }
  });
  assert.equal(dryRun.dry_run, true);
  assert.equal(dryRun.would_change, false);
  assert.equal(
    (dryRun.warnings || []).some((row) => String(row).includes('selected_keys: empty')),
    false
  );
});

test('compileRules enforces critical and identity buckets from expectations and canonical identity keys', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase1-compiler-buckets-');
  try {
    const workbookPath = createMouseWorkbookPath(root);
    const workbookMap = buildMouseWorkbookMapWithOverrides({
      fieldStudioSourcePath: workbookPath,
      fieldOverrides: {
        polling_rate: {
          required_level: 'expected',
          priority: {
            required_level: 'expected'
          }
        },
        sku: {
          required_level: 'expected',
          priority: {
            required_level: 'expected'
          }
        }
      },
      expectations: {
        critical_fields: ['polling_rate']
      }
    });
    const compiled = await compileRules({
      category: 'mouse',
      fieldStudioSourcePath: workbookPath,
      fieldStudioMap: workbookMap,
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      }
    });
    assert.equal(compiled.compiled, true);

    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRules = JSON.parse(await fs.readFile(path.join(generatedRoot, 'field_rules.json'), 'utf8'));
    const compileReport = JSON.parse(await fs.readFile(path.join(generatedRoot, '_compile_report.json'), 'utf8'));

    assert.equal(fieldRules.fields.polling_rate.required_level, 'critical');
    assert.equal(fieldRules.fields.polling_rate.priority.required_level, 'critical');
    assert.equal(fieldRules.fields.sku.required_level, 'identity');
    assert.equal(fieldRules.fields.sku.priority.required_level, 'identity');
    assert.equal(Number(compileReport.counts.critical) >= 1, true);
    assert.equal(Number(compileReport.counts.identity) >= 1, true);
  } finally {
    await removeRoot(root);
  }
});

test('validateRules reports missing required artifacts', async () => {
  const { root, helperRoot, categoriesRoot } = await cloneCompiledMouseBaseline('phase1-compiler-missing-');
  try {
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await fs.rm(path.join(generatedRoot, 'parse_templates.json'), { force: true });

    const validation = await validateRules({
      category: 'mouse',
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      }
    });
    assert.equal(validation.valid, false);
    assert.equal(
      validation.errors.some((row) => String(row).includes('parse_templates.json')),
      true
    );
  } finally {
    await removeRoot(root);
  }
});

test('validateRules fails when artifact violates shared JSON schema', async () => {
  const { root, helperRoot, categoriesRoot } = await cloneCompiledMouseBaseline('phase1-compiler-schema-invalid-');
  try {
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    await fs.writeFile(
      path.join(generatedRoot, 'parse_templates.json'),
      `${JSON.stringify({ category: 'mouse', templates: 'invalid-type' }, null, 2)}\n`,
      'utf8'
    );

    const validation = await validateRules({
      category: 'mouse',
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      }
    });
    assert.equal(validation.valid, false);
    assert.equal(validation.schema.valid, false);
    assert.equal(
      validation.errors.some((row) => String(row).includes('schema validation failed: parse_templates.json')),
      true
    );
  } finally {
    await removeRoot(root);
  }
});

test('validateRules reports missing required per-field metadata', async () => {
  const { root, helperRoot, categoriesRoot } = await cloneCompiledMouseBaseline('phase1-compiler-metadata-invalid-');
  try {
    const generatedRoot = path.join(helperRoot, 'mouse', '_generated');
    const fieldRulesPath = path.join(generatedRoot, 'field_rules.json');
    const fieldRules = JSON.parse(await fs.readFile(fieldRulesPath, 'utf8'));
    fieldRules.fields.connection.required_level = '';
    fieldRules.fields.connection.priority.required_level = '';
    await fs.writeFile(fieldRulesPath, `${JSON.stringify(fieldRules, null, 2)}\n`, 'utf8');

    const validation = await validateRules({
      category: 'mouse',
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      }
    });
    assert.equal(validation.valid, false);
    assert.equal(validation.stats.fields_with_incomplete_metadata > 0, true);
    assert.equal(
      validation.errors.some((row) => String(row).includes("metadata validation failed: field 'connection'")),
      true
    );
  } finally {
    await removeRoot(root);
  }
});

test('initCategory creates category scaffolding only in category_authority for category-specific config', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase1-init-category-');
  try {
    const initResult = await initCategory({
      category: 'monitor',
      template: 'electronics',
      config: {
        categoryAuthorityRoot: helperRoot,
        categoriesRoot
      }
    });
    assert.equal(initResult.created, true);
    assert.equal(await pathExists(path.join(helperRoot, 'monitor', '_source')), true);
    assert.equal(await pathExists(path.join(helperRoot, 'monitor', '_generated')), true);
    assert.equal(await pathExists(path.join(helperRoot, 'monitor', '_overrides')), true);
    assert.equal(await pathExists(path.join(helperRoot, 'monitor', 'schema.json')), true);
    assert.equal(await pathExists(path.join(helperRoot, 'monitor', 'sources.json')), true);
    const initSchema = JSON.parse(await fs.readFile(path.join(helperRoot, 'monitor', 'schema.json'), 'utf8'));
    assert.equal(Array.isArray(initSchema.required_fields), true);
    assert.equal(typeof initSchema.anchor_fields, 'object');
    assert.equal(Array.isArray(initSchema.search_templates), true);
    assert.equal(initSchema.search_templates.length > 0, true);
    assert.equal(initResult.shared_schema_root, path.join(helperRoot, '_global', '_shared'));
    assert.equal(await pathExists(path.join(helperRoot, '_global', '_shared', 'base_field_schema.json')), true);
    assert.equal(await pathExists(path.join(helperRoot, '_global', '_shared', 'base_component_schema.json')), true);
    assert.equal(await pathExists(path.join(categoriesRoot, '_shared')), false);
    assert.equal(await pathExists(path.join(categoriesRoot, 'monitor')), false);
  } finally {
    await removeRoot(root);
  }
});

test('normalizeFieldRulesForPhase1 backfills required schema blocks for sparse fields', () => {
  const normalized = normalizeFieldRulesForPhase1({
    category: 'mouse',
    fields: {
      switches_link: {
        data_type: 'string',
        output_shape: 'scalar',
        required_level: 'optional',
        availability: 'sometimes',
        difficulty: 'medium',
        effort: 5,
        evidence_required: false
      }
    }
  });

  const row = normalized?.fields?.switches_link || {};
  assert.equal(typeof row.contract, 'object');
  assert.equal(row.contract.type, 'string');
  assert.equal(row.contract.shape, 'scalar');
  assert.equal(typeof row.priority, 'object');
  assert.equal(row.priority.required_level, 'optional');
  assert.equal(typeof row.parse, 'object');
  assert.equal(typeof row.evidence, 'object');
  assert.equal(row.evidence.required, false);
});

test('compile-time EG injection: EG-locked keys appear in compiled output even when absent from source map', async () => {
  const { root, helperRoot, categoriesRoot, workbookPath } = await cloneCompiledMouseBaseline('phase1-eg-inject-');
  try {
    // Build a map that deliberately EXCLUDES colors and editions
    const mapWithoutEg = buildMouseWorkbookMap(workbookPath);
    mapWithoutEg.selected_keys = mapWithoutEg.selected_keys.filter(
      (k) => !EG_LOCKED_KEYS.includes(k)
    );
    delete mapWithoutEg.field_overrides?.colors;
    delete mapWithoutEg.field_overrides?.editions;

    const result = await compileRules({
      category: 'mouse',
      fieldStudioSourcePath: workbookPath,
      fieldStudioMap: mapWithoutEg,
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot },
    });
    assert.equal(result.compiled, true);

    // Read the compiled field_rules.json
    const fieldRulesPath = path.join(helperRoot, 'mouse', '_generated', 'field_rules.json');
    const fieldRules = JSON.parse(await fs.readFile(fieldRulesPath, 'utf8'));

    // Every EG-locked key must appear in compiled fields
    for (const k of EG_LOCKED_KEYS) {
      assert.ok(fieldRules.fields?.[k], `EG-locked key '${k}' must be in compiled field_rules.json`);
      assert.equal(fieldRules.fields[k].field_key, k);
    }
  } finally {
    await removeRoot(root);
  }
});
