import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_RULE_KINDS,
  FIELD_RULE_SCHEMA,
} from '../fieldRuleSchema.js';

test('FIELD_RULE_SCHEMA is a frozen non-empty registry', () => {
  assert.ok(Array.isArray(FIELD_RULE_SCHEMA), 'schema must be an array');
  assert.ok(FIELD_RULE_SCHEMA.length >= 20, `expected >=20 entries, got ${FIELD_RULE_SCHEMA.length}`);
  assert.ok(Object.isFrozen(FIELD_RULE_SCHEMA), 'schema array must be frozen');
});

test('FIELD_RULE_SCHEMA entries have required authoring metadata', () => {
  for (const entry of FIELD_RULE_SCHEMA) {
    assert.equal(typeof entry.path, 'string', `${entry.path}: path must be a string`);
    assert.ok(entry.path.length > 0, 'path must be non-empty');
    assert.equal(typeof entry.label, 'string', `${entry.path}: label must be a string`);
    assert.ok(entry.label.length > 0, `${entry.path}: label must be non-empty`);
    assert.ok(FIELD_RULE_KINDS.has(entry.kind), `${entry.path}: unknown kind ${entry.kind}`);
    assert.equal(typeof entry.doc, 'string', `${entry.path}: doc must be a string`);
    assert.ok(entry.doc.length > 0, `${entry.path}: doc must be non-empty`);
  }
});

test('FIELD_RULE_SCHEMA has no duplicate paths', () => {
  const paths = FIELD_RULE_SCHEMA.map((entry) => entry.path);
  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);

  assert.deepEqual(duplicates, []);
});

test('FIELD_RULE_SCHEMA preserves critical AI assist paths for downstream migration', () => {
  const paths = new Set(FIELD_RULE_SCHEMA.map((entry) => entry.path));

  assert.ok(paths.has('ai_assist.reasoning_note'));
  assert.ok(paths.has('ai_assist.variant_inventory_usage.enabled'));
  assert.ok(paths.has('ai_assist.pif_priority_images.enabled'));
});
