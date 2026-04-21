// Characterization test: proves validateField uses null for absent values.
// The 'unk' sentinel has been removed — absence is represented by null.
// See: docs/implementation/field-rules-studio/unknown-token-retirement-roadmap.md
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateField } from '../validateField.js';

function rule(requiredLevel) {
  return {
    contract: { shape: 'scalar', type: 'string' },
    parse: {},
    enum: {},
    priority: { required_level: requiredLevel },
  };
}

// ── Absence tokens normalize to null ─────────────────────────────────────

describe('validateField — absence tokens normalize to null', () => {
  const cases = [
    { label: 'null → null', value: null },
    { label: 'unk string → null', value: 'unk' },
    { label: 'n/a → null', value: 'n/a' },
    { label: 'empty string → null', value: '' },
    { label: 'tbd → null', value: 'tbd' },
    { label: 'unknown → null', value: 'unknown' },
  ];

  for (const { label, value } of cases) {
    it(label, () => {
      const r = validateField({ fieldKey: 'test', value, fieldRule: rule('optional') });
      assert.equal(r.valid, true);
      assert.equal(r.value, null, `expected null for: ${label}`);
    });
  }
});

// ── Publish gate blocks null for required fields ─────────────────────────

describe('validateField — publish gate blocks null', () => {
  const cases = [
    { label: 'null blocked for mandatory', value: null, level: 'mandatory' },
    { label: 'unk string blocked for mandatory', value: 'unk', level: 'mandatory' },
    { label: 'n/a blocked for mandatory', value: 'n/a', level: 'mandatory' },
  ];

  for (const { label, value, level } of cases) {
    it(label, () => {
      const r = validateField({ fieldKey: 'test', value, fieldRule: rule(level) });
      assert.equal(r.valid, false);
      assert.ok(r.rejections.some(j => j.reason_code === 'unk_blocks_publish'), `missing unk_blocks_publish for: ${label}`);
    });
  }
});

// ── No spurious unk_blocks_publish when gate is off ─────────────────────

describe('validateField — no spurious unk rejections when publish gate is off', () => {
  const levels = ['non_mandatory', 'supplemental', 'nice_to_have', ''];

  for (const level of levels) {
    it(`required_level='${level}': null does not trigger unk_blocks_publish`, () => {
      const r = validateField({ fieldKey: 'test', value: null, fieldRule: rule(level) });
      const unkRejections = r.rejections.filter(j => j.reason_code === 'unk_blocks_publish');
      assert.equal(unkRejections.length, 0, `spurious unk_blocks_publish for level=${level}`);
    });
  }
});
