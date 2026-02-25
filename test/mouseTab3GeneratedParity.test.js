import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeKey(value) {
  return String(value || '').trim();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

test('mouse tab3 map keys are covered by generated field rules (with migrations)', async () => {
  const categoryRoot = path.join(process.cwd(), 'helper_files', 'mouse');
  const generatedRoot = path.join(categoryRoot, '_generated');
  const controlRoot = path.join(categoryRoot, '_control_plane');

  const [fieldStudioMap, fieldRules, keyMigrations] = await Promise.all([
    readJson(path.join(controlRoot, 'field_studio_map.json')),
    readJson(path.join(generatedRoot, 'field_rules.json')),
    readJson(path.join(generatedRoot, 'key_migrations.json')),
  ]);

  const generatedKeys = new Set(Object.keys(asObject(fieldRules.fields)));
  const migrationMap = new Map();
  for (const row of Array.isArray(keyMigrations.migrations) ? keyMigrations.migrations : []) {
    if (!row || typeof row !== 'object') continue;
    const from = normalizeKey(row.from);
    const to = normalizeKey(row.to);
    if (!from || !to) continue;
    migrationMap.set(from, to);
  }

  const resolveGeneratedKey = (rawKey) => {
    const key = normalizeKey(rawKey);
    if (!key) return '';
    if (generatedKeys.has(key)) return key;
    const migrated = migrationMap.get(key);
    return normalizeKey(migrated);
  };

  const missingSelected = [];
  for (const key of Array.isArray(fieldStudioMap.selected_keys) ? fieldStudioMap.selected_keys : []) {
    const resolved = resolveGeneratedKey(key);
    if (!resolved || !generatedKeys.has(resolved)) {
      missingSelected.push(normalizeKey(key));
    }
  }

  const missingOverrides = [];
  for (const key of Object.keys(asObject(fieldStudioMap.field_overrides))) {
    const resolved = resolveGeneratedKey(key);
    if (!resolved || !generatedKeys.has(resolved)) {
      missingOverrides.push(normalizeKey(key));
    }
  }

  const missingComponentProperties = [];
  for (const sourceRow of Array.isArray(fieldStudioMap.component_sources) ? fieldStudioMap.component_sources : []) {
    const properties = Array.isArray(sourceRow?.roles?.properties) ? sourceRow.roles.properties : [];
    for (const property of properties) {
      const key = normalizeKey(property?.field_key || property?.key);
      if (!key) continue;
      const resolved = resolveGeneratedKey(key);
      if (!resolved || !generatedKeys.has(resolved)) {
        missingComponentProperties.push(key);
      }
    }
  }

  assert.deepEqual(missingSelected, []);
  assert.deepEqual(missingOverrides, []);
  assert.deepEqual(missingComponentProperties, []);
});
