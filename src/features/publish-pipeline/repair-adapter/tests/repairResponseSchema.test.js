import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRepairResponse,
  applyRepairDecisions,
  repairResponseJsonSchema,
} from '../repairResponseSchema.js';

// ── Factories ────────────────────────────────────────────────────────────────

function makeDecision(overrides = {}) {
  return {
    value: 'pink',
    decision: 'map_to_existing',
    resolved_to: 'magenta',
    confidence: 0.9,
    reasoning: 'close color match',
    ...overrides,
  };
}

function makeResponse(overrides = {}) {
  return {
    status: 'repaired',
    reason: null,
    decisions: [makeDecision()],
    ...overrides,
  };
}

// ── parseRepairResponse — valid inputs ───────────────────────────────────────

describe('parseRepairResponse — valid', () => {
  it('parses minimal valid response (repaired, 1 decision)', () => {
    const result = parseRepairResponse(makeResponse());
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'repaired');
    assert.equal(result.data.decisions.length, 1);
    assert.equal(result.data.decisions[0].value, 'pink');
  });

  it('parses rerun_recommended status', () => {
    const result = parseRepairResponse(makeResponse({ status: 'rerun_recommended' }));
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'rerun_recommended');
  });

  it('parses multiple decisions', () => {
    const decisions = [
      makeDecision({ value: 'pink' }),
      makeDecision({ value: 'sparkle-unicorn', decision: 'reject', resolved_to: null }),
      makeDecision({ value: 'teal', decision: 'keep_new', resolved_to: 'teal' }),
    ];
    const result = parseRepairResponse(makeResponse({ decisions }));
    assert.equal(result.ok, true);
    assert.equal(result.data.decisions.length, 3);
  });

  it('accepts confidence at boundary 0.0', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ confidence: 0.0 })],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.data.decisions[0].confidence, 0.0);
  });

  it('accepts confidence at boundary 1.0', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ confidence: 1.0 })],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.data.decisions[0].confidence, 1.0);
  });

  it('accepts all 4 decision types', () => {
    const types = ['map_to_existing', 'keep_new', 'reject', 'set_unk'];
    for (const decision of types) {
      const result = parseRepairResponse(makeResponse({
        decisions: [makeDecision({ decision, resolved_to: decision === 'reject' ? null : 'val' })],
      }));
      assert.equal(result.ok, true, `decision type '${decision}' should be valid`);
    }
  });

  it('accepts null reason', () => {
    const result = parseRepairResponse(makeResponse({ reason: null }));
    assert.equal(result.ok, true);
    assert.equal(result.data.reason, null);
  });

  it('accepts string reason', () => {
    const result = parseRepairResponse(makeResponse({ reason: 'source data is garbled' }));
    assert.equal(result.ok, true);
    assert.equal(result.data.reason, 'source data is garbled');
  });

  it('accepts resolved_to as a number', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ resolved_to: 42 })],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.data.decisions[0].resolved_to, 42);
  });

  it('accepts resolved_to as null', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ decision: 'reject', resolved_to: null })],
    }));
    assert.equal(result.ok, true);
    assert.equal(result.data.decisions[0].resolved_to, null);
  });
});

// ── parseRepairResponse — invalid inputs ─────────────────────────────────────

describe('parseRepairResponse — invalid', () => {
  it('rejects missing status', () => {
    const { status, ...rest } = makeResponse();
    const result = parseRepairResponse(rest);
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it('rejects invalid status value', () => {
    const result = parseRepairResponse(makeResponse({ status: 'fixed' }));
    assert.equal(result.ok, false);
  });

  it('rejects missing decisions', () => {
    const { decisions, ...rest } = makeResponse();
    const result = parseRepairResponse(rest);
    assert.equal(result.ok, false);
  });

  it('rejects decisions not an array', () => {
    const result = parseRepairResponse(makeResponse({ decisions: 'not array' }));
    assert.equal(result.ok, false);
  });

  it('rejects decision missing value field', () => {
    const { value, ...dec } = makeDecision();
    const result = parseRepairResponse(makeResponse({ decisions: [dec] }));
    assert.equal(result.ok, false);
  });

  it('rejects decision missing decision field', () => {
    const { decision, ...dec } = makeDecision();
    const result = parseRepairResponse(makeResponse({ decisions: [dec] }));
    assert.equal(result.ok, false);
  });

  it('rejects invalid decision type', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ decision: 'guess' })],
    }));
    assert.equal(result.ok, false);
  });

  it('rejects confidence > 1.0', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ confidence: 1.5 })],
    }));
    assert.equal(result.ok, false);
  });

  it('rejects confidence < 0.0', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ confidence: -0.1 })],
    }));
    assert.equal(result.ok, false);
  });

  it('rejects confidence not a number', () => {
    const result = parseRepairResponse(makeResponse({
      decisions: [makeDecision({ confidence: 'high' })],
    }));
    assert.equal(result.ok, false);
  });

  it('rejects null input', () => {
    const result = parseRepairResponse(null);
    assert.equal(result.ok, false);
  });

  it('rejects string input', () => {
    const result = parseRepairResponse('not an object');
    assert.equal(result.ok, false);
  });

  it('rejects empty object', () => {
    const result = parseRepairResponse({});
    assert.equal(result.ok, false);
  });
});

// ── applyRepairDecisions — scalar ────────────────────────────────────────────

describe('applyRepairDecisions — scalar', () => {
  it('applies map_to_existing with high confidence', () => {
    const decisions = [makeDecision({ value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', confidence: 0.9 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'pink', shape: 'scalar' });
    assert.equal(result.value, 'magenta');
    assert.equal(result.confidence, 0.9);
    assert.equal(result.applied.length, 1);
    assert.equal(result.skipped.length, 0);
  });

  it('flags decision with confidence 0.5-0.8', () => {
    const decisions = [makeDecision({ confidence: 0.6 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'pink', shape: 'scalar' });
    assert.equal(result.value, 'magenta');
    assert.equal(result.confidence, 0.6);
    assert.equal(result.applied[0].flagged, true);
  });

  it('skips decision with confidence < 0.5', () => {
    const decisions = [makeDecision({ confidence: 0.3 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'pink', shape: 'scalar' });
    assert.equal(result.value, 'unk');
    assert.equal(result.skipped.length, 1);
  });

  it('sets unk for reject decision', () => {
    const decisions = [makeDecision({ decision: 'reject', resolved_to: null, confidence: 0.9 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'pink', shape: 'scalar' });
    assert.equal(result.value, 'unk');
  });

  it('sets unk for set_unk decision', () => {
    const decisions = [makeDecision({ decision: 'set_unk', resolved_to: null, confidence: 0.9 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'pink', shape: 'scalar' });
    assert.equal(result.value, 'unk');
  });

  it('keeps original value for keep_new decision', () => {
    const decisions = [makeDecision({ value: 'midnight-blue', decision: 'keep_new', resolved_to: 'midnight-blue', confidence: 0.85 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'midnight-blue', shape: 'scalar' });
    assert.equal(result.value, 'midnight-blue');
  });

  it('preserves numeric resolved_to', () => {
    const decisions = [makeDecision({ value: 'twenty', resolved_to: 20, confidence: 0.95 })];
    const result = applyRepairDecisions({ decisions, currentValue: 'twenty', shape: 'scalar' });
    assert.equal(result.value, 20);
    assert.equal(typeof result.value, 'number');
  });
});

// ── applyRepairDecisions — list ──────────────────────────────────────────────

describe('applyRepairDecisions — list', () => {
  it('maps all decisions with high confidence', () => {
    const decisions = [
      makeDecision({ value: 'pink', resolved_to: 'magenta', confidence: 0.9 }),
      makeDecision({ value: 'sparkle', resolved_to: 'silver', confidence: 0.85 }),
      makeDecision({ value: 'teal', resolved_to: 'teal', decision: 'keep_new', confidence: 0.8 }),
    ];
    const result = applyRepairDecisions({ decisions, currentValue: ['pink', 'sparkle', 'teal'], shape: 'list' });
    assert.deepEqual(result.value, ['magenta', 'silver', 'teal']);
    assert.equal(result.applied.length, 3);
  });

  it('drops rejected items from list', () => {
    const decisions = [
      makeDecision({ value: 'pink', resolved_to: 'magenta', confidence: 0.9 }),
      makeDecision({ value: 'sparkle-unicorn', decision: 'reject', resolved_to: null, confidence: 0.95 }),
    ];
    const result = applyRepairDecisions({ decisions, currentValue: ['pink', 'sparkle-unicorn'], shape: 'list' });
    assert.deepEqual(result.value, ['magenta']);
  });

  it('returns empty list when all rejected', () => {
    const decisions = [
      makeDecision({ value: 'phantom-blue', decision: 'reject', resolved_to: null, confidence: 0.9 }),
      makeDecision({ value: 'galaxy-fade', decision: 'reject', resolved_to: null, confidence: 0.9 }),
    ];
    const result = applyRepairDecisions({ decisions, currentValue: ['phantom-blue', 'galaxy-fade'], shape: 'list' });
    assert.deepEqual(result.value, []);
  });
});

// ── applyRepairDecisions — edge cases ────────────────────────────────────────

describe('applyRepairDecisions — edge cases', () => {
  it('returns currentValue for empty decisions array', () => {
    const result = applyRepairDecisions({ decisions: [], currentValue: 'pink', shape: 'scalar' });
    assert.equal(result.value, 'pink');
    assert.equal(result.applied.length, 0);
  });

  it('returns currentValue for null decisions', () => {
    const result = applyRepairDecisions({ decisions: null, currentValue: 42, shape: 'scalar' });
    assert.equal(result.value, 42);
  });
});

// ── repairResponseJsonSchema ─────────────────────────────────────────────────

describe('repairResponseJsonSchema', () => {
  it('is a plain object with type and properties', () => {
    assert.equal(typeof repairResponseJsonSchema, 'object');
    assert.ok(repairResponseJsonSchema !== null);
    assert.equal(repairResponseJsonSchema.type, 'object');
    assert.ok(repairResponseJsonSchema.properties);
    assert.ok(repairResponseJsonSchema.properties.status);
    assert.ok(repairResponseJsonSchema.properties.decisions);
  });

  it('does not include $schema key', () => {
    assert.equal(repairResponseJsonSchema.$schema, undefined);
  });
});
