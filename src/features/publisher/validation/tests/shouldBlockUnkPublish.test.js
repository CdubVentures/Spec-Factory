// WHY: Unit tests for shouldBlockUnkPublish + regression guard ensuring
// publish_gate / block_publish_when_unk flags stay retired from generated output.
// See: docs/implementation/field-rules-studio/publish-gate-retirement-roadmap.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldBlockUnkPublish } from '../shouldBlockUnkPublish.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATEGORY_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', 'category_authority');

// ── Section A: Unit test matrix (table-driven) ─────────────────────────

const CASES = [
  { level: 'mandatory',     expected: true },
  { level: 'non_mandatory', expected: false },
  { level: '',              expected: false },
];

describe('shouldBlockUnkPublish — unit matrix', () => {
  for (const { level, expected } of CASES) {
    it(`required_level "${level}" → ${expected}`, () => {
      const rule = { priority: { required_level: level } };
      assert.equal(shouldBlockUnkPublish(rule), expected);
    });
  }

  it('missing priority → false', () => {
    assert.equal(shouldBlockUnkPublish({}), false);
  });

  it('null fieldRule → false', () => {
    assert.equal(shouldBlockUnkPublish(null), false);
  });
});

// ── Section B: Regression guard — retired per-field flags must not exist in generated JSON
// WHY: The root-level "publish_gate": "required_complete" is a global strategy name (out of scope).
// We check per-field priority blocks only.

const CATEGORIES = ['keyboard', 'monitor', 'mouse', '_test_keyboard'];
const RETIRED_KEYS = ['publish_gate', 'block_publish_when_unk', 'publish_gate_reason'];

describe('shouldBlockUnkPublish — regression: retired flags not in per-field priority', () => {
  for (const category of CATEGORIES) {
    it(`${category}: no field has publish_gate or block_publish_when_unk in priority`, () => {
      const rulesPath = resolve(CATEGORY_ROOT, category, '_generated', 'field_rules.json');
      const raw = JSON.parse(readFileSync(rulesPath, 'utf8'));
      const fields = raw.fields || {};
      const keys = Object.keys(fields);
      assert.ok(keys.length > 0, `${category} should have fields`);

      const violations = [];
      for (const key of keys) {
        const pri = fields[key]?.priority || {};
        for (const retired of RETIRED_KEYS) {
          if (retired in pri) {
            violations.push({ key, retiredKey: retired, value: pri[retired] });
          }
        }
      }
      assert.equal(violations.length, 0,
        `${category}: ${violations.length} fields still have retired keys:\n${JSON.stringify(violations, null, 2)}`);
    });
  }
});
