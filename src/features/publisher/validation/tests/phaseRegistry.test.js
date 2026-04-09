import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_REGISTRY } from '../phaseRegistry.js';

// ── Registry structure tests ────────────────────────────────────────

describe('PHASE_REGISTRY — structure', () => {
  it('exports exactly 11 phases', () => {
    assert.equal(PHASE_REGISTRY.length, 11);
  });

  it('every entry has required fields', () => {
    for (const phase of PHASE_REGISTRY) {
      assert.ok(typeof phase.id === 'string', `${phase.id}: id must be string`);
      assert.ok(typeof phase.title === 'string', `${phase.id}: title must be string`);
      assert.ok(typeof phase.order === 'number', `${phase.id}: order must be number`);
      assert.ok(typeof phase.description === 'string', `${phase.id}: description must be string`);
      assert.ok(typeof phase.behaviorNote === 'string', `${phase.id}: behaviorNote must be string`);
      assert.ok(typeof phase.isApplicable === 'function', `${phase.id}: isApplicable must be function`);
      assert.ok(typeof phase.triggerDetail === 'function', `${phase.id}: triggerDetail must be function`);
    }
  });

  it('order values are unique and sequential from 0', () => {
    const orders = PHASE_REGISTRY.map((p) => p.order);
    const expected = Array.from({ length: 11 }, (_, i) => i);
    assert.deepEqual(orders, expected);
  });

  it('ids are unique', () => {
    const ids = PHASE_REGISTRY.map((p) => p.id);
    assert.equal(new Set(ids).size, 11);
  });

  it('does not contain template_dispatch phase', () => {
    const ids = PHASE_REGISTRY.map((p) => p.id);
    assert.ok(!ids.includes('template_dispatch'));
  });

  it('contains type_coerce phase (replaces type)', () => {
    const ids = PHASE_REGISTRY.map((p) => p.id);
    assert.ok(ids.includes('type_coerce'));
  });
});

// ── Applicability predicate tests (table-driven) ────────────────────

function rule(overrides = {}) {
  return {
    contract: { shape: 'scalar', type: 'string', ...(overrides.contract || {}) },
    parse: { ...(overrides.parse || {}) },
    enum: { ...(overrides.enum || {}) },
    ...overrides,
  };
}

function phaseById(id) {
  return PHASE_REGISTRY.find((p) => p.id === id);
}

describe('PHASE_REGISTRY — isApplicable predicates', () => {

  // ── absence ───────────────────────────────────────────────────
  describe('absence', () => {
    const phase = () => phaseById('absence');

    it('always applicable — default rule', () => {
      assert.equal(phase().isApplicable(rule()), true);
    });

    it('always applicable — null rule', () => {
      assert.equal(phase().isApplicable(null), true);
    });
  });

  // ── shape ─────────────────────────────────────────────────────
  describe('shape', () => {
    const phase = () => phaseById('shape');

    it('always applicable — default rule', () => {
      assert.equal(phase().isApplicable(rule()), true);
    });

    it('always applicable — null rule', () => {
      assert.equal(phase().isApplicable(null), true);
    });
  });

  // ── unit ──────────────────────────────────────────────────────
  describe('unit', () => {
    const phase = () => phaseById('unit');

    it('applicable when contract.unit is truthy', () => {
      assert.equal(phase().isApplicable(rule({ contract: { unit: 'g' } })), true);
    });

    it('not applicable when contract.unit is empty', () => {
      assert.equal(phase().isApplicable(rule({ contract: { unit: '' } })), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── type_coerce ───────────────────────────────────────────────
  describe('type_coerce', () => {
    const phase = () => phaseById('type_coerce');

    it('always applicable — default rule', () => {
      assert.equal(phase().isApplicable(rule()), true);
    });

    it('always applicable — empty rule', () => {
      assert.equal(phase().isApplicable({}), true);
    });

    it('always applicable — null rule', () => {
      assert.equal(phase().isApplicable(null), true);
    });
  });

  // ── normalize ─────────────────────────────────────────────────
  describe('normalize', () => {
    const phase = () => phaseById('normalize');

    it('always applicable — default rule', () => {
      assert.equal(phase().isApplicable(rule()), true);
    });

    it('always applicable — null rule', () => {
      assert.equal(phase().isApplicable(null), true);
    });
  });

  // ── format ────────────────────────────────────────────────────
  describe('format', () => {
    const phase = () => phaseById('format');

    it('applicable when type has FORMAT_REGISTRY entry (boolean)', () => {
      assert.equal(phase().isApplicable(rule({ contract: { type: 'boolean' } })), true);
    });

    it('applicable when type has FORMAT_REGISTRY entry (date)', () => {
      assert.equal(phase().isApplicable(rule({ contract: { type: 'date' } })), true);
    });

    it('applicable when type has FORMAT_REGISTRY entry (url)', () => {
      assert.equal(phase().isApplicable(rule({ contract: { type: 'url' } })), true);
    });

    it('not applicable for string type (no format registry entry)', () => {
      assert.equal(phase().isApplicable(rule({ contract: { type: 'string' } })), false);
    });

    it('applicable when format_hint is set (even for string)', () => {
      assert.equal(phase().isApplicable(rule({ contract: { type: 'string' }, enum: { match: { format_hint: '^\\d+$' } } })), true);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── list_rules ────────────────────────────────────────────────
  describe('list_rules', () => {
    const phase = () => phaseById('list_rules');

    it('applicable when shape=list AND list_rules exists', () => {
      assert.equal(phase().isApplicable(rule({ contract: { shape: 'list', list_rules: { sort: 'alpha' } } })), true);
    });

    it('not applicable when shape=list but no list_rules', () => {
      assert.equal(phase().isApplicable(rule({ contract: { shape: 'list' } })), false);
    });

    it('not applicable when shape=scalar', () => {
      assert.equal(phase().isApplicable(rule({ contract: { shape: 'scalar', list_rules: { sort: 'alpha' } } })), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── rounding ──────────────────────────────────────────────────
  describe('rounding', () => {
    const phase = () => phaseById('rounding');

    it('applicable when contract.rounding exists', () => {
      assert.equal(phase().isApplicable(rule({ contract: { rounding: { precision: 2 } } })), true);
    });

    it('not applicable when no rounding config', () => {
      assert.equal(phase().isApplicable(rule()), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── enum ──────────────────────────────────────────────────────
  describe('enum', () => {
    const phase = () => phaseById('enum');

    it('applicable when enum.policy set AND knownValuesCount > 0', () => {
      assert.equal(phase().isApplicable(rule({ enum: { policy: 'closed' } }), { knownValuesCount: 5 }), true);
    });

    it('not applicable when knownValuesCount = 0', () => {
      assert.equal(phase().isApplicable(rule({ enum: { policy: 'closed' } }), { knownValuesCount: 0 }), false);
    });

    it('not applicable when no enum.policy', () => {
      assert.equal(phase().isApplicable(rule(), { knownValuesCount: 10 }), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null, null), false);
    });
  });

  // ── range ─────────────────────────────────────────────────────
  describe('range', () => {
    const phase = () => phaseById('range');

    it('applicable when contract.range exists', () => {
      assert.equal(phase().isApplicable(rule({ contract: { range: { min: 0, max: 100 } } })), true);
    });

    it('not applicable when no range config', () => {
      assert.equal(phase().isApplicable(rule()), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── publish_gate ──────────────────────────────────────────────
  describe('publish_gate', () => {
    const phase = () => phaseById('publish_gate');

    it('applicable when block_publish_when_unk is true', () => {
      assert.equal(phase().isApplicable({ priority: { block_publish_when_unk: true } }), true);
    });

    it('not applicable when flag is false', () => {
      assert.equal(phase().isApplicable({ priority: { block_publish_when_unk: false } }), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });
});

// ── triggerDetail tests ─────────────────────────────────────────────

describe('PHASE_REGISTRY — triggerDetail', () => {
  it('every phase returns a string from triggerDetail', () => {
    const r = rule({
      contract: {
        shape: 'list',
        type: 'number',
        unit: 'g',
        rounding: { precision: 2, mode: 'nearest' },
        range: { min: 0, max: 100 },
        list_rules: { sort: 'alpha', dedupe: true },
      },
      parse: { token_map: { na: 'unk' } },
      enum: { policy: 'closed' },
    });
    const ctx = { knownValuesCount: 5 };

    for (const phase of PHASE_REGISTRY) {
      const detail = phase.triggerDetail(r, ctx);
      assert.ok(typeof detail === 'string', `${phase.id}: triggerDetail must return string, got ${typeof detail}`);
    }
  });

  it('triggerDetail is safe with null rule', () => {
    for (const phase of PHASE_REGISTRY) {
      const detail = phase.triggerDetail(null, null);
      assert.ok(typeof detail === 'string', `${phase.id}: triggerDetail must handle null rule`);
    }
  });

  it('triggerDetail is safe with empty rule', () => {
    for (const phase of PHASE_REGISTRY) {
      const detail = phase.triggerDetail({}, {});
      assert.ok(typeof detail === 'string', `${phase.id}: triggerDetail must handle empty rule`);
    }
  });
});
