import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  compileRules,
  compileRulesAll,
  discoverCompileCategories,
  initCategory,
  readCompileReport,
  rulesDiff,
  watchCompileRules
} from '../compiler.js';
import {
  buildMouseWorkbookMap,
  createCompilerWorkspace,
  createMouseWorkbookPath,
  removeRoot,
} from './helpers/fieldRulesCompilerHarness.js';

test('compileRulesAll discovers and compiles initialized categories', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase2-compile-all-');
  try {
    const workbookPath = createMouseWorkbookPath(root);
    const workbookMap = buildMouseWorkbookMap(workbookPath);
    const single = await compileRules({
      category: 'mouse',
      fieldStudioSourcePath: workbookPath,
      fieldStudioMap: workbookMap,
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(single.compiled, true);

    const all = await compileRulesAll({
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(all.compiled, true);
    assert.equal(all.count, 1);
    assert.equal(all.categories.includes('mouse'), true);
    assert.equal(all.results.length, 1);
    assert.equal(all.results[0].compiled, true);
  } finally {
    await removeRoot(root);
  }
});

test('discoverCompileCategories ignores init-only categories until a control-plane map or compiled rules exist', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase2-compile-starter-');
  try {
    await initCategory({
      category: 'monitor',
      template: 'electronics',
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });

    const discovered = await discoverCompileCategories({
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(discovered.categories.includes('monitor'), false);
  } finally {
    await removeRoot(root);
  }
});

test('readCompileReport returns report and rulesDiff classifies change safety', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase2-report-diff-');
  try {
    const workbookPath = createMouseWorkbookPath(root);
    const workbookMap = buildMouseWorkbookMap(workbookPath);
    const compiled = await compileRules({
      category: 'mouse',
      fieldStudioSourcePath: workbookPath,
      fieldStudioMap: workbookMap,
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(compiled.compiled, true);

    const report = await readCompileReport({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot }
    });
    assert.equal(report.exists, true);
    assert.equal(typeof report.report, 'object');
    assert.equal(typeof report.report.compiled, 'boolean');

    const diff = await rulesDiff({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(typeof diff.would_change, 'boolean');
    assert.equal(Array.isArray(diff.changes), true);
    assert.equal(typeof diff.classification, 'object');
    assert.equal(
      ['safe', 'potentially_breaking', 'breaking'].includes(diff.classification.severity),
      true
    );
    assert.equal(typeof diff.classification.breaking, 'boolean');
  } finally {
    await removeRoot(root);
  }
});

test('compileRules emits key_migrations with semver metadata and migration list', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase2-key-migrations-');
  try {
    const workbookPath = createMouseWorkbookPath(root);
    const workbookMap = buildMouseWorkbookMap(workbookPath);
    const compiled = await compileRules({
      category: 'mouse',
      fieldStudioSourcePath: workbookPath,
      fieldStudioMap: workbookMap,
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(compiled.compiled, true);

    const keyMigrationsPath = path.join(helperRoot, 'mouse', '_generated', 'key_migrations.json');
    const keyMigrations = JSON.parse(await fs.readFile(keyMigrationsPath, 'utf8'));
    assert.equal(typeof keyMigrations.version, 'string');
    assert.equal(typeof keyMigrations.previous_version, 'string');
    assert.equal(Array.isArray(keyMigrations.migrations), true);
    assert.equal(typeof keyMigrations.key_map, 'object');
  } finally {
    await removeRoot(root);
  }
});

test('watchCompileRules runs initial compile and stops on maxEvents', async () => {
  const { root, helperRoot, categoriesRoot } = await createCompilerWorkspace('phase2-watch-');
  try {
    const workbookPath = createMouseWorkbookPath(root);
    const workbookMap = buildMouseWorkbookMap(workbookPath);
    const compiled = await compileRules({
      category: 'mouse',
      fieldStudioSourcePath: workbookPath,
      fieldStudioMap: workbookMap,
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot }
    });
    assert.equal(compiled.compiled, true);

    const watch = await watchCompileRules({
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot, categoriesRoot },
      watchSeconds: 10,
      maxEvents: 1,
      debounceMs: 50
    });

    assert.equal(watch.category, 'mouse');
    assert.equal(watch.compile_count, 1);
    assert.equal(Array.isArray(watch.events), true);
    assert.equal(watch.events.length >= 1, true);
    assert.equal(watch.events[0].trigger, 'initial');
    assert.equal(['max_events_reached', 'watch_timeout'].includes(watch.reason), true);
  } finally {
    await removeRoot(root);
  }
});
