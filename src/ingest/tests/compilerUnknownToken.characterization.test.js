// WHY: Characterization test — proves unknown_token and unknown_reason_required
// have been removed from all compiled field rules after the unk sentinel retirement.
// Temporary — prune after unknown-token retirement is verified green.
// See: docs/implementation/field-rules-studio/unknown-token-retirement-roadmap.md

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');

const categories = ['keyboard', 'mouse', 'monitor'];

// ── Retired knobs are absent from all compiled field rules ───────────────

for (const category of categories) {
  const filePath = resolve(root, 'category_authority', category, '_generated', 'field_rules.json');
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const fields = data.fields;
  const fieldKeys = Object.keys(fields);

  test(`[${category}] field_rules.json loads with ${fieldKeys.length} fields`, () => {
    assert.ok(fieldKeys.length > 0, `${category} has no fields`);
  });

  for (const key of fieldKeys) {
    const contract = fields[key]?.contract;

    test(`[${category}] ${key}: unknown_token is absent`, () => {
      assert.equal('unknown_token' in (contract || {}), false,
        `${category}/${key} still has unknown_token`);
    });

    test(`[${category}] ${key}: unknown_reason_required is absent`, () => {
      assert.equal('unknown_reason_required' in (contract || {}), false,
        `${category}/${key} still has unknown_reason_required`);
    });
  }
}
