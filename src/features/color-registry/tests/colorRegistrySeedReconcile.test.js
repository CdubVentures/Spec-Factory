import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../../../db/appDb.js';
import { seedColorRegistry } from '../colorRegistrySeed.js';

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

function tmpJsonPath() {
  return path.join(os.tmpdir(), `color_reconcile_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
}

function cleanup(filePath) {
  try { unlinkSync(filePath); } catch { /* ignore */ }
}

function writeColorJson(filePath, colors) {
  const colorMap = {};
  for (const { name, hex } of colors) {
    colorMap[name] = { hex, css_var: `--color-${name}` };
  }
  writeFileSync(filePath, JSON.stringify({ _doc: 'test', _version: 1, colors: colorMap }, null, 2));
}

// ── Hash-gated reconcile ────────────────────────────────────────────────────

describe('seedColorRegistry hash-gated reconcile', () => {
  let jsonPath;
  afterEach(() => { if (jsonPath) cleanup(jsonPath); });

  test('full reconcile on first run (no stored hash)', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    writeColorJson(jsonPath, [
      { name: 'red', hex: '#ff0000' },
      { name: 'blue', hex: '#0000ff' },
    ]);
    try {
      const result = seedColorRegistry(db, jsonPath);
      assert.equal(result.seeded, 2);
      assert.ok(db.getSeedHash('color_registry'));
    } finally {
      db.close();
    }
  });

  test('skips when hash unchanged', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    writeColorJson(jsonPath, [{ name: 'red', hex: '#ff0000' }]);
    try {
      seedColorRegistry(db, jsonPath);
      const result = seedColorRegistry(db, jsonPath);
      assert.equal(result.seeded, 0);
      assert.equal(result.removed, 0);
    } finally {
      db.close();
    }
  });

  test('re-seeds and updates existing colors when file changes', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    writeColorJson(jsonPath, [{ name: 'red', hex: '#ff0000' }]);
    try {
      seedColorRegistry(db, jsonPath);
      assert.equal(db.getColor('red').hex, '#ff0000');

      writeColorJson(jsonPath, [{ name: 'red', hex: '#ee0000' }]);
      const result = seedColorRegistry(db, jsonPath);
      assert.ok(result.seeded > 0);
      assert.equal(db.getColor('red').hex, '#ee0000');
    } finally {
      db.close();
    }
  });

  test('removes stale colors not in source', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    writeColorJson(jsonPath, [
      { name: 'red', hex: '#ff0000' },
      { name: 'blue', hex: '#0000ff' },
    ]);
    try {
      seedColorRegistry(db, jsonPath);
      assert.equal(db.listColors().length, 2);

      writeColorJson(jsonPath, [{ name: 'red', hex: '#ff0000' }]);
      const result = seedColorRegistry(db, jsonPath);
      assert.equal(result.removed, 1);
      assert.equal(db.listColors().length, 1);
      assert.equal(db.getColor('blue'), null);
    } finally {
      db.close();
    }
  });

  test('handles missing file gracefully (falls back to defaults)', () => {
    const db = createTestDb();
    try {
      const result = seedColorRegistry(db, '/nonexistent/color_registry.json');
      assert.ok(result.seeded > 0);
      assert.ok(db.listColors().length > 50);
    } finally {
      db.close();
    }
  });
});
