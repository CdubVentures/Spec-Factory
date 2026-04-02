import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../../../db/appDb.js';
import { EG_DEFAULT_COLORS, seedColorRegistry, writeBackColorRegistry } from '../colorRegistrySeed.js';

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

function tmpJsonPath() {
  const dir = os.tmpdir();
  return path.join(dir, `color_registry_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
}

function cleanup(filePath) {
  try { unlinkSync(filePath); } catch { /* ignore */ }
}

// ── EG_DEFAULT_COLORS ──

describe('EG_DEFAULT_COLORS', () => {
  it('has expected entry count (base + light + dark)', () => {
    assert.ok(EG_DEFAULT_COLORS.length >= 70, `expected 70+ colors, got ${EG_DEFAULT_COLORS.length}`);
  });

  it('all entries have valid hex format', () => {
    for (const c of EG_DEFAULT_COLORS) {
      assert.match(c.hex, /^#[0-9a-fA-F]{6}$/, `invalid hex for ${c.name}: ${c.hex}`);
    }
  });

  it('all entries have non-empty lowercase names', () => {
    for (const c of EG_DEFAULT_COLORS) {
      assert.ok(c.name.length > 0, 'name must be non-empty');
      assert.equal(c.name, c.name.toLowerCase(), `name must be lowercase: ${c.name}`);
    }
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_DEFAULT_COLORS));
  });
});

// ── seedColorRegistry ──

describe('seedColorRegistry — no JSON file', () => {
  it('seeds all defaults from code into empty DB', () => {
    const db = createTestDb();
    try {
      const result = seedColorRegistry(db, null);
      assert.equal(result.seeded, EG_DEFAULT_COLORS.length);
      assert.equal(db.listColors().length, EG_DEFAULT_COLORS.length);
    } finally {
      db.close();
    }
  });

  it('is idempotent (twice = no new rows)', () => {
    const db = createTestDb();
    try {
      seedColorRegistry(db, null);
      const result = seedColorRegistry(db, null);
      assert.equal(result.seeded, 0);
      assert.equal(db.listColors().length, EG_DEFAULT_COLORS.length);
    } finally {
      db.close();
    }
  });

  it('does not overwrite user-edited hex values', () => {
    const db = createTestDb();
    try {
      db.upsertColor({ name: 'red', hex: '#ff0000', css_var: '--color-red' });
      seedColorRegistry(db, null);
      const row = db.getColor('red');
      assert.equal(row.hex, '#ff0000');
    } finally {
      db.close();
    }
  });

  it('derives css_var as --color-{name}', () => {
    const db = createTestDb();
    try {
      seedColorRegistry(db, null);
      const row = db.getColor('light-blue');
      assert.equal(row.css_var, '--color-light-blue');
    } finally {
      db.close();
    }
  });
});

describe('seedColorRegistry — with JSON file', () => {
  let jsonPath;
  afterEach(() => { if (jsonPath) cleanup(jsonPath); });

  it('seeds from JSON file when it exists', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    const payload = {
      _doc: 'test',
      _version: 1,
      colors: {
        turquoise: { hex: '#40e0d0', css_var: '--color-turquoise' },
        navy: { hex: '#000080', css_var: '--color-navy' },
      },
    };
    writeFileSync(jsonPath, JSON.stringify(payload));
    try {
      const result = seedColorRegistry(db, jsonPath);
      assert.equal(result.seeded, 2);
      assert.equal(db.listColors().length, 2);
      assert.equal(db.getColor('turquoise').hex, '#40e0d0');
      assert.equal(db.getColor('navy').hex, '#000080');
    } finally {
      db.close();
    }
  });

  it('writes JSON from defaults when file does not exist', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      seedColorRegistry(db, jsonPath);
      const raw = readFileSync(jsonPath, 'utf8');
      const data = JSON.parse(raw);
      assert.equal(data._version, 1);
      assert.ok(data.colors.black);
      assert.equal(data.colors.black.hex, '#3A3F41');
      assert.equal(data.colors.black.css_var, '--color-black');
    } finally {
      db.close();
    }
  });
});

// ── writeBackColorRegistry ──

describe('writeBackColorRegistry', () => {
  let jsonPath;
  afterEach(() => { if (jsonPath) cleanup(jsonPath); });

  it('produces valid JSON matching seed structure', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      db.upsertColor({ name: 'red', hex: '#ef4444', css_var: '--color-red' });
      db.upsertColor({ name: 'blue', hex: '#3b82f6', css_var: '--color-blue' });
      writeBackColorRegistry(db, jsonPath);
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      assert.equal(data._doc, 'Global color registry. Managed by GUI.');
      assert.equal(data._version, 1);
      assert.equal(data.colors.red.hex, '#ef4444');
      assert.equal(data.colors.blue.hex, '#3b82f6');
    } finally {
      db.close();
    }
  });

  it('round-trip: seed → write-back → re-read → identical', () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      seedColorRegistry(db, null);
      writeBackColorRegistry(db, jsonPath);
      const db2 = createTestDb();
      try {
        const result = seedColorRegistry(db2, jsonPath);
        assert.equal(result.seeded, EG_DEFAULT_COLORS.length);
        const list1 = db.listColors().map((c) => ({ name: c.name, hex: c.hex }));
        const list2 = db2.listColors().map((c) => ({ name: c.name, hex: c.hex }));
        assert.deepEqual(list1, list2);
      } finally {
        db2.close();
      }
    } finally {
      db.close();
    }
  });
});
