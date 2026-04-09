import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRepairPrompt,
  buildCrossFieldRepairPrompt,
  buildFieldContractBlock,
  REPAIR_SYSTEM_PROMPT,
  HALLUCINATION_PATTERNS,
} from '../promptBuilder.js';

// ── Factories ────────────────────────────────────────────────────────────────

function makeFieldRule(overrides = {}) {
  return {
    contract: { shape: 'scalar', type: 'string', unit: '', ...overrides.contract },
    parse: { ...overrides.parse },
    ...overrides,
  };
}

function makeRejection(reason_code, detail = {}) {
  return { reason_code, detail };
}

// ── Null / skip cases ────────────────────────────────────────────────────────

describe('buildRepairPrompt — null/skip', () => {
  it('returns null for empty rejections array', () => {
    const result = buildRepairPrompt({ rejections: [], value: 'pink', fieldKey: 'color', fieldRule: makeFieldRule() });
    assert.equal(result, null);
  });

  it('returns null for null rejections', () => {
    const result = buildRepairPrompt({ rejections: null, value: 'pink', fieldKey: 'color', fieldRule: makeFieldRule() });
    assert.equal(result, null);
  });

  it('returns null for only wrong_shape rejections (P8 excluded)', () => {
    const rejections = [makeRejection('wrong_shape', { expected: 'list', reason: 'expected list' })];
    const result = buildRepairPrompt({ rejections, value: 'pink', fieldKey: 'color', fieldRule: makeFieldRule() });
    assert.equal(result, null);
  });

  it('returns null when no fieldKey', () => {
    const rejections = [makeRejection('wrong_type', { expected: 'number', reason: 'not a number' })];
    const result = buildRepairPrompt({ rejections, value: 'abc', fieldKey: null, fieldRule: makeFieldRule() });
    assert.equal(result, null);
  });
});

// ── P1: enum_closed_mismatch ─────────────────────────────────────────────────

describe('buildRepairPrompt — P1 (enum closed)', () => {
  it('builds P1 prompt for closed enum rejection', () => {
    const rejections = [makeRejection('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' })];
    const knownValues = { policy: 'closed', values: ['black', 'white', 'red'] };
    const result = buildRepairPrompt({ rejections, value: 'pink', fieldKey: 'color', fieldRule: makeFieldRule(), knownValues });

    assert.equal(result.promptId, 'P1');
    assert.ok(result.user.includes('pink'));
    assert.ok(result.user.includes('closed'));
    assert.ok(result.user.includes('black'));
    assert.ok(result.params.unknownValues);
    assert.ok(result.params.registeredValues);
    assert.equal(result.params.count, 3);
  });

  it('includes multiple unknowns', () => {
    const rejections = [makeRejection('enum_value_not_allowed', { unknown: ['pink', 'sparkle-unicorn'], policy: 'closed' })];
    const knownValues = { policy: 'closed', values: ['black', 'white'] };
    const result = buildRepairPrompt({ rejections, value: ['pink', 'sparkle-unicorn'], fieldKey: 'color', fieldRule: makeFieldRule(), knownValues });

    assert.equal(result.promptId, 'P1');
    assert.ok(result.user.includes('pink'));
    assert.ok(result.user.includes('sparkle-unicorn'));
  });
});

// ── P2: enum_open_prefer_known ───────────────────────────────────────────────

describe('buildRepairPrompt — P2 (enum open_prefer_known)', () => {
  it('builds P2 prompt for open_prefer_known enum rejection', () => {
    const rejections = [makeRejection('enum_value_not_allowed', { unknown: ['midnight-blue'], policy: 'open_prefer_known' })];
    const knownValues = { policy: 'open_prefer_known', values: ['black', 'white', 'red'] };
    const result = buildRepairPrompt({ rejections, value: 'midnight-blue', fieldKey: 'color', fieldRule: makeFieldRule(), knownValues });

    assert.equal(result.promptId, 'P2');
    assert.ok(result.user.includes('open_prefer_known'));
    assert.ok(result.user.includes('midnight-blue'));
    assert.ok(result.params.knownValues);
  });
});

// ── P3: type_coercion_failure ────────────────────────────────────────────────

describe('buildRepairPrompt — P3 (wrong_type)', () => {
  it('builds P3 prompt for type coercion failure', () => {
    const rejections = [makeRejection('wrong_type', { expected: 'number', reason: 'not parseable' })];
    const rule = makeFieldRule({ contract: { type: 'number' } });
    const result = buildRepairPrompt({ rejections, value: 'twenty grams', fieldKey: 'weight', fieldRule: rule });

    assert.equal(result.promptId, 'P3');
    assert.ok(result.user.includes('twenty grams'));
    assert.ok(result.user.includes('number'));
    assert.equal(result.params.rawValue, 'twenty grams');
    assert.equal(result.params.expectedType, 'number');
    assert.equal(result.params.resolvedType, 'number');
  });
});

// ── P4: format_failure ───────────────────────────────────────────────────────

describe('buildRepairPrompt — P4 (format_mismatch)', () => {
  it('builds P4 prompt for format mismatch', () => {
    const rejections = [makeRejection('format_mismatch', { reason: 'does not match url pattern' })];
    const rule = makeFieldRule({ contract: { type: 'url' } });
    const result = buildRepairPrompt({ rejections, value: 'not a url', fieldKey: 'spec_url', fieldRule: rule });

    assert.equal(result.promptId, 'P4');
    assert.ok(result.user.includes('not a url'));
    assert.equal(result.params.normalizedValue, 'not a url');
    assert.equal(result.params.resolvedType, 'url');
  });
});

// ── unit_required prompt ────────────────────────────────────────────────────

describe('buildRepairPrompt — unit_required', () => {
  it('builds prompt for bare number missing required unit', () => {
    const rejections = [makeRejection('unit_required', { expected: 'g', detected: '' })];
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g' }, parse: { strict_unit_required: true } });
    const result = buildRepairPrompt({ rejections, value: '42', fieldKey: 'weight', fieldRule: rule });

    assert.equal(result.promptId, 'unit_conversion');
    assert.ok(result.user.includes("'g'"));
  });
});

// ── P7: out_of_range ─────────────────────────────────────────────────────────

describe('buildRepairPrompt — P7 (out_of_range)', () => {
  it('builds P7 prompt for range violation', () => {
    const rejections = [makeRejection('out_of_range', { min: 5, max: 500, actual: 5000 })];
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g', range: { min: 5, max: 500 } } });
    const result = buildRepairPrompt({ rejections, value: 5000, fieldKey: 'weight', fieldRule: rule });

    assert.equal(result.promptId, 'P7');
    assert.ok(result.user.includes('5000'));
    assert.ok(result.params.bounds);
    assert.equal(result.params.bounds.min, 5);
    assert.equal(result.params.bounds.max, 500);
  });
});

// ── wrong_unit (unit_conversion) ─────────────────────────────────────────────

describe('buildRepairPrompt — unit_conversion (wrong_unit)', () => {
  it('builds unit conversion prompt for wrong unit', () => {
    const rejections = [makeRejection('wrong_unit', { expected: 'g', detected: 'lb' })];
    const rule = makeFieldRule({ contract: { unit: 'g' } });
    const result = buildRepairPrompt({ rejections, value: '2.65 lb', fieldKey: 'weight', fieldRule: rule });

    assert.equal(result.promptId, 'unit_conversion');
    assert.ok(result.user.includes('2.65 lb'));
    assert.ok(result.user.includes("'g'"));
    assert.ok(result.user.includes("'lb'"));
    assert.equal(result.params.expectedUnit, 'g');
    assert.equal(result.params.detectedUnit, 'lb');
  });
});

// ── Multi-rejection ──────────────────────────────────────────────────────────

describe('buildRepairPrompt — multi-rejection', () => {
  it('first promptable rejection wins (pipeline order)', () => {
    const rejections = [
      makeRejection('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      makeRejection('out_of_range', { min: 0, max: 100, actual: 200 }),
    ];
    const knownValues = { policy: 'closed', values: ['black'] };
    const result = buildRepairPrompt({ rejections, value: 'pink', fieldKey: 'color', fieldRule: makeFieldRule(), knownValues });
    assert.equal(result.promptId, 'P1');
  });
});

// ── System prompt + jsonSchema ───────────────────────────────────────────────

describe('buildRepairPrompt — system prompt + schema', () => {
  it('includes REPAIR_SYSTEM_PROMPT and HALLUCINATION_PATTERNS in system', () => {
    const rejections = [makeRejection('wrong_type', { expected: 'number', reason: 'fail' })];
    const result = buildRepairPrompt({ rejections, value: 'abc', fieldKey: 'weight', fieldRule: makeFieldRule() });
    assert.ok(result.system.includes('field value validator'));
    assert.ok(result.system.includes('HALLUCINATION'));
  });

  it('includes jsonSchema in output', () => {
    const rejections = [makeRejection('wrong_type', { expected: 'number', reason: 'fail' })];
    const result = buildRepairPrompt({ rejections, value: 'abc', fieldKey: 'weight', fieldRule: makeFieldRule() });
    assert.equal(typeof result.jsonSchema, 'object');
    assert.ok(result.jsonSchema.properties);
  });
});

// ── Field contract block enrichment ──────────────────────────────────────────

describe('buildRepairPrompt — field contract block', () => {
  it('P1 includes FIELD CONTRACT block', () => {
    const rejections = [makeRejection('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' })];
    const rule = makeFieldRule({ contract: { type: 'string', shape: 'scalar' }, enum: { policy: 'closed' } });
    const kv = { policy: 'closed', values: ['black'] };
    const result = buildRepairPrompt({ rejections, value: 'pink', fieldKey: 'color', fieldRule: rule, knownValues: kv });
    assert.ok(result.user.includes('FIELD CONTRACT'));
    assert.ok(result.user.includes("'color'"));
  });

  it('P3 includes full contract (type, unit, range)', () => {
    const rejections = [makeRejection('wrong_type', { expected: 'number', reason: 'fail' })];
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g', range: { min: 5, max: 500 } } });
    const result = buildRepairPrompt({ rejections, value: 'abc', fieldKey: 'weight', fieldRule: rule });
    assert.ok(result.user.includes('FIELD CONTRACT'));
    assert.ok(result.user.includes('number'));
    assert.ok(result.user.includes('5 to 500'));
  });

  it('P7 includes rounding info', () => {
    const rejections = [makeRejection('out_of_range', { min: 5, max: 500, actual: 5000 })];
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g', range: { min: 5, max: 500 }, rounding: { decimals: 1, mode: 'nearest' } } });
    const result = buildRepairPrompt({ rejections, value: 5000, fieldKey: 'weight', fieldRule: rule });
    assert.ok(result.user.includes('Rounding'));
    assert.ok(result.user.includes('1 decimals'));
  });
});

describe('buildRepairPrompt — format_hint enrichment', () => {
  it('P1 includes format_hint when present', () => {
    const rejections = [makeRejection('enum_value_not_allowed', { unknown: ['3 rgb'], policy: 'closed' })];
    const rule = makeFieldRule({ enum: { policy: 'closed', match: { strategy: 'alias', format_hint: '^\\d+ Zone \\(RGB\\)$' } } });
    const kv = { policy: 'closed', values: ['3 Zone (RGB)'] };
    const result = buildRepairPrompt({ rejections, value: '3 rgb', fieldKey: 'lighting', fieldRule: rule, knownValues: kv });
    assert.ok(result.user.includes('format_hint') || result.user.includes('Format pattern') || result.user.includes('\\d+ Zone'));
  });

  it('P1 includes match strategy', () => {
    const rejections = [makeRejection('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' })];
    const rule = makeFieldRule({ enum: { policy: 'closed', match: { strategy: 'alias' } } });
    const kv = { policy: 'closed', values: ['black'] };
    const result = buildRepairPrompt({ rejections, value: 'pink', fieldKey: 'color', fieldRule: rule, knownValues: kv });
    assert.ok(result.user.includes('alias'));
  });

  it('P4 includes format_hint when present', () => {
    const rejections = [makeRejection('format_mismatch', { reason: 'bad format' })];
    const rule = makeFieldRule({ enum: { match: { format_hint: '^\\d+ Zone' } } });
    const result = buildRepairPrompt({ rejections, value: 'bad', fieldKey: 'lighting', fieldRule: rule });
    assert.ok(result.user.includes('\\d+ Zone'));
  });
});

describe('buildRepairPrompt — unit_conversions enrichment', () => {
  it('unit prompt includes conversion factors when present', () => {
    const rejections = [makeRejection('wrong_unit', { expected: 'g', detected: 'lb' })];
    const rule = makeFieldRule({ contract: { unit: 'g' }, parse: { unit_conversions: { lb: 453.592, oz: 28.3495 } } });
    const result = buildRepairPrompt({ rejections, value: '2.65 lb', fieldKey: 'weight', fieldRule: rule });
    assert.ok(result.user.includes('453.592'));
    assert.ok(result.user.includes('conversion factor'));
  });

  it('unit prompt works without conversions', () => {
    const rejections = [makeRejection('wrong_unit', { expected: 'g', detected: 'lb' })];
    const rule = makeFieldRule({ contract: { unit: 'g' } });
    const result = buildRepairPrompt({ rejections, value: '2.65 lb', fieldKey: 'weight', fieldRule: rule });
    assert.equal(result.promptId, 'unit_conversion');
    // Should NOT contain conversion factors
    assert.equal(result.user.includes('conversion factor'), false);
  });
});

// ── Exported constants ───────────────────────────────────────────────────────

describe('exported constants', () => {
  it('REPAIR_SYSTEM_PROMPT is a non-empty string', () => {
    assert.equal(typeof REPAIR_SYSTEM_PROMPT, 'string');
    assert.ok(REPAIR_SYSTEM_PROMPT.length > 50);
  });

  it('HALLUCINATION_PATTERNS is a non-empty string', () => {
    assert.equal(typeof HALLUCINATION_PATTERNS, 'string');
    assert.ok(HALLUCINATION_PATTERNS.length > 50);
  });
});

// ── P6: cross-field ──────────────────────────────────────────────────────────

describe('buildCrossFieldRepairPrompt — P6', () => {
  it('builds P6 prompt from cross-field failures', () => {
    const crossFieldFailures = [
      { rule_id: 'wireless_battery', constraint: 'conditional', pass: false, action: 'reject_candidate', detail: { trigger: 'connection=wireless' } },
    ];
    const fields = { connection: 'wireless', battery_hours: 'unk' };
    const result = buildCrossFieldRepairPrompt({ crossFieldFailures, fields, productName: 'Razer Viper V3' });

    assert.equal(result.promptId, 'P6');
    assert.ok(result.user.includes('Razer Viper V3'));
    assert.ok(result.user.includes('wireless_battery'));
    assert.ok(result.params.productName);
    assert.ok(result.params.constraintList);
  });

  it('returns null for empty failures', () => {
    const result = buildCrossFieldRepairPrompt({ crossFieldFailures: [], fields: {}, productName: 'Test' });
    assert.equal(result, null);
  });

  it('returns null for null failures', () => {
    const result = buildCrossFieldRepairPrompt({ crossFieldFailures: null, fields: {}, productName: 'Test' });
    assert.equal(result, null);
  });
});
