// WHY: Golden-master characterization tests proving policy drives validateField
// enum behavior through the full pipeline (normalize → checkEnum).
// Must be GREEN before any match_strategy retirement code changes.
// See: docs/implementation/field-rules-studio/match-strategy-retirement-roadmap.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateField } from '../validateField.js';

function makeRule({ policy, strategy } = {}) {
  return {
    contract: { shape: 'scalar', type: 'string' },
    parse: {},
    enum: {
      policy,
      ...(strategy ? { match: { strategy } } : {}),
    },
  };
}

// ── closed — flag unknowns for LLM repair ──────────────────────────────────

describe('characterization: closed policy through full pipeline', () => {
  const known = { policy: 'closed', values: ['black', 'white', 'red'] };
  const rule = makeRule({ policy: 'closed', strategy: 'exact' });

  it('known value → valid', () => {
    const r = validateField({ fieldKey: 'color', value: 'black', fieldRule: rule, knownValues: known });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'black');
  });

  it('uppercase known → normalize fixes it before enum check', () => {
    // WHY: Step 4 lowercases 'Black' → 'black' before checkEnum.
    // Exact match succeeds because normalize already did the work.
    const r = validateField({ fieldKey: 'color', value: 'Black', fieldRule: rule, knownValues: known });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'black');
    assert.ok(r.repairs.some(rep => rep.step === 'normalize'));
  });

  it('unknown value → invalid, flagged for LLM repair', () => {
    const r = validateField({ fieldKey: 'color', value: 'teal', fieldRule: rule, knownValues: known });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'enum_value_not_allowed'));
  });

  it('unknown mixed-case → normalize + still rejected', () => {
    const r = validateField({ fieldKey: 'color', value: 'Midnight Blue', fieldRule: rule, knownValues: known });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'enum_value_not_allowed'));
  });
});

// ── open_prefer_known — alias resolution through full pipeline ──────────────

describe('characterization: open_prefer_known policy through full pipeline', () => {
  const switchKnown = { policy: 'open_prefer_known', values: ['Cherry MX Red', 'Cherry MX Brown'] };
  const lightingKnown = { policy: 'open_prefer_known', values: ['3 Zone (RGB)', '4 Zone (RGB)', 'None'] };
  const rule = makeRule({ policy: 'open_prefer_known', strategy: 'alias' });

  it('canonical value → normalize + alias repair back to canonical', () => {
    // WHY: 'Cherry MX Red' normalizes to 'cherry-mx-red', then alias resolves back.
    const r = validateField({ fieldKey: 'switch_type', value: 'Cherry MX Red', fieldRule: rule, knownValues: switchKnown });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'Cherry MX Red');
    assert.ok(r.repairs.some(rep => rep.step === 'enum_alias'));
  });

  it('normalized format mismatch → alias resolves', () => {
    // WHY: '3 Zone (RGB)' normalizes to '3-zone-(rgb)', alias resolves to '3 Zone (RGB)'.
    const r = validateField({ fieldKey: 'lighting', value: '3 Zone (RGB)', fieldRule: rule, knownValues: lightingKnown });
    assert.equal(r.valid, true);
    assert.equal(r.value, '3 Zone (RGB)');
  });

  it('truly unknown → valid but flagged', () => {
    const r = validateField({ fieldKey: 'switch_type', value: 'Gateron Red', fieldRule: rule, knownValues: switchKnown });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unknown_enum_prefer_known'));
  });

  it('lowercase known → normalize + alias repair', () => {
    const r = validateField({ fieldKey: 'switch_type', value: 'cherry mx brown', fieldRule: rule, knownValues: switchKnown });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'Cherry MX Brown');
  });
});

// ── open — accept everything through full pipeline ──────────────────────────

describe('characterization: open policy through full pipeline', () => {
  const known = { policy: 'open', values: ['black', 'white'] };
  const rule = makeRule({ policy: 'open', strategy: 'alias' });

  it('any value passes', () => {
    const r = validateField({ fieldKey: 'sku', value: 'ABC-12345', fieldRule: rule, knownValues: known });
    assert.equal(r.valid, true);
  });

  it('unknown value passes with no flags', () => {
    const r = validateField({ fieldKey: 'sku', value: 'totally-new-value', fieldRule: rule, knownValues: known });
    assert.equal(r.valid, true);
    assert.equal(r.rejections.length, 0);
  });

  it('no known values → still passes', () => {
    const r = validateField({ fieldKey: 'notes', value: 'free text here', fieldRule: rule, knownValues: null });
    assert.equal(r.valid, true);
  });
});
