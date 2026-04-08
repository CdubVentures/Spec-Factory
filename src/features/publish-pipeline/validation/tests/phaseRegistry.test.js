import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_REGISTRY } from '../phaseRegistry.js';

// ── Registry structure tests ────────────────────────────────────────

describe('PHASE_REGISTRY — structure', () => {
  it('exports exactly 12 phases', () => {
    assert.equal(PHASE_REGISTRY.length, 12);
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
    const expected = Array.from({ length: 12 }, (_, i) => i);
    assert.deepEqual(orders, expected);
  });

  it('ids are unique', () => {
    const ids = PHASE_REGISTRY.map((p) => p.id);
    assert.equal(new Set(ids).size, 12);
  });
});

// ── Applicability predicate tests (table-driven) ────────────────────

const DISPATCHED_TEMPLATE = 'boolean_yes_no_unk';
const NON_DISPATCHED_TEMPLATE = 'text_field';
const FORMAT_TEMPLATE = 'date_field';
const COMPONENT_TEMPLATE = 'component_reference';

// Helper: build a minimal rule object
function rule(overrides = {}) {
  return {
    contract: { shape: 'scalar', type: 'string', ...(overrides.contract || {}) },
    parse: { template: 'text_field', ...(overrides.parse || {}) },
    enum: { ...(overrides.enum || {}) },
    component: { ...(overrides.component || {}) },
    ...overrides,
  };
}

function phaseById(id) {
  return PHASE_REGISTRY.find((p) => p.id === id);
}

describe('PHASE_REGISTRY — isApplicable predicates', () => {

  // ── Step 0: Absence Normalization ───────────────────────────────
  describe('absence (step 0)', () => {
    const phase = () => phaseById('absence');

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

  // ── Step 1: Template Dispatch ───────────────────────────────────
  describe('template_dispatch (step 1)', () => {
    const phase = () => phaseById('template_dispatch');

    it('applicable when parse.template is a dispatched template', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: DISPATCHED_TEMPLATE } })), true);
    });

    it('not applicable for text_field (fallthrough)', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: NON_DISPATCHED_TEMPLATE } })), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── Step 2: Shape Check ─────────────────────────────────────────
  describe('shape (step 2)', () => {
    const phase = () => phaseById('shape');

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

  // ── Step 3: Unit Verification ───────────────────────────────────
  describe('unit (step 3)', () => {
    const phase = () => phaseById('unit');

    it('applicable when contract.unit is truthy and NOT dispatched', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { unit: 'g' },
        parse: { template: NON_DISPATCHED_TEMPLATE },
      })), true);
    });

    it('not applicable when contract.unit is empty', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { unit: '' },
        parse: { template: NON_DISPATCHED_TEMPLATE },
      })), false);
    });

    it('not applicable when template is dispatched (even with unit)', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { unit: 'g' },
        parse: { template: DISPATCHED_TEMPLATE },
      })), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── Step 4: Type Check ──────────────────────────────────────────
  describe('type (step 4)', () => {
    const phase = () => phaseById('type');

    it('applicable when template is NOT dispatched', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: NON_DISPATCHED_TEMPLATE } })), true);
    });

    it('not applicable when template IS dispatched', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: DISPATCHED_TEMPLATE } })), false);
    });

    it('applicable for empty rule (defaults to text_field = not dispatched)', () => {
      assert.equal(phase().isApplicable({}), true);
    });

    it('applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), true);
    });
  });

  // ── Step 5: String Normalization ────────────────────────────────
  describe('normalize (step 5)', () => {
    const phase = () => phaseById('normalize');

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

  // ── Step 6: Format Check ────────────────────────────────────────
  describe('format (step 6)', () => {
    const phase = () => phaseById('format');

    it('applicable when parse.template is in FORMAT_REGISTRY', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: FORMAT_TEMPLATE } })), true);
    });

    it('applicable for boolean_yes_no_unk (also in format registry)', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: 'boolean_yes_no_unk' } })), true);
    });

    it('not applicable for text_field (not in format registry)', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: NON_DISPATCHED_TEMPLATE } })), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── Step 7: List Rules ──────────────────────────────────────────
  describe('list_rules (step 7)', () => {
    const phase = () => phaseById('list_rules');

    it('applicable when shape=list AND list_rules exists', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { shape: 'list', list_rules: { sort: 'alpha' } },
      })), true);
    });

    it('not applicable when shape=list but no list_rules', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { shape: 'list' },
      })), false);
    });

    it('not applicable when shape=scalar (even with list_rules)', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { shape: 'scalar', list_rules: { sort: 'alpha' } },
      })), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── Step 8: Rounding ────────────────────────────────────────────
  describe('rounding (step 8)', () => {
    const phase = () => phaseById('rounding');

    it('applicable when contract.rounding exists', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { rounding: { precision: 2 } },
      })), true);
    });

    it('not applicable when no rounding config', () => {
      assert.equal(phase().isApplicable(rule()), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── Step 9: Enum Check ──────────────────────────────────────────
  describe('enum (step 9)', () => {
    const phase = () => phaseById('enum');

    it('applicable when enum.policy is set AND knownValuesCount > 0', () => {
      assert.equal(phase().isApplicable(
        rule({ enum: { policy: 'closed' } }),
        { knownValuesCount: 5 },
      ), true);
    });

    it('not applicable when enum.policy is set but knownValuesCount = 0', () => {
      assert.equal(phase().isApplicable(
        rule({ enum: { policy: 'closed' } }),
        { knownValuesCount: 0 },
      ), false);
    });

    it('not applicable when no enum.policy (even with known values)', () => {
      assert.equal(phase().isApplicable(
        rule(),
        { knownValuesCount: 10 },
      ), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}, {}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null, null), false);
    });
  });

  // ── Step 10: Range Check ────────────────────────────────────────
  describe('range (step 10)', () => {
    const phase = () => phaseById('range');

    it('applicable when contract.range exists', () => {
      assert.equal(phase().isApplicable(rule({
        contract: { range: { min: 0, max: 100 } },
      })), true);
    });

    it('not applicable when no range config', () => {
      assert.equal(phase().isApplicable(rule()), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
    });

    it('not applicable for null rule', () => {
      assert.equal(phase().isApplicable(null), false);
    });
  });

  // ── Step 11: Component Resolution ───────────────────────────────
  describe('component (step 11)', () => {
    const phase = () => phaseById('component');

    it('applicable when parse.template = component_reference', () => {
      assert.equal(phase().isApplicable(rule({
        parse: { template: COMPONENT_TEMPLATE },
      })), true);
    });

    it('not applicable for other templates', () => {
      assert.equal(phase().isApplicable(rule({ parse: { template: 'text_field' } })), false);
    });

    it('not applicable for empty rule', () => {
      assert.equal(phase().isApplicable({}), false);
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
      parse: { template: 'boolean_yes_no_unk', unit_accepts: ['g', 'kg'], token_map: { na: 'unk' } },
      enum: { policy: 'closed' },
      component: { type: 'chipset' },
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
