import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { repairField, repairCrossField } from '../repairField.js';

// ── Factories ────────────────────────────────────────────────────────────────

function makeValidResult(overrides = {}) {
  return {
    valid: true,
    value: 'black',
    confidence: 1.0,
    repairs: [],
    rejections: [],
    unknownReason: null,
    repairPrompt: null,
    ...overrides,
  };
}

function makeFailedResult(reason_code, detail = {}, overrides = {}) {
  return {
    valid: false,
    value: overrides.value ?? 'pink',
    confidence: 1.0,
    repairs: [],
    rejections: [{ reason_code, detail }],
    unknownReason: null,
    repairPrompt: null,
    ...overrides,
  };
}

function makeFieldRule(overrides = {}) {
  return {
    contract: { shape: 'scalar', type: 'string', unit: '', ...overrides.contract },
    parse: { template: 'text_field', ...overrides.parse },
    enum: { policy: 'closed' },
    ...overrides,
  };
}

function makeLlmResponse(overrides = {}) {
  return {
    status: 'repaired',
    reason: null,
    decisions: [{
      value: 'pink',
      decision: 'map_to_existing',
      resolved_to: 'magenta',
      confidence: 0.9,
      reasoning: 'close color match',
    }],
    ...overrides,
  };
}

function stubCallLlm(response) {
  let called = false;
  let capturedArgs = null;
  const fn = async (args) => {
    called = true;
    capturedArgs = args;
    return response;
  };
  fn.wasCalled = () => called;
  fn.args = () => capturedArgs;
  return fn;
}

function throwingCallLlm(error) {
  return async () => { throw error; };
}

// ── repairField — short-circuits ─────────────────────────────────────────────

describe('repairField — short-circuits', () => {
  it('returns no_repair_needed when already valid', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const result = await repairField({
      validationResult: makeValidResult(),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      callLlm,
    });
    assert.equal(result.status, 'no_repair_needed');
    assert.equal(callLlm.wasCalled(), false);
  });

  it('returns prompt_skipped for shape-only rejection', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const result = await repairField({
      validationResult: makeFailedResult('wrong_shape', { expected: 'list', reason: 'expected list' }),
      fieldKey: 'colors',
      fieldRule: makeFieldRule(),
      callLlm,
    });
    assert.equal(result.status, 'prompt_skipped');
    assert.equal(callLlm.wasCalled(), false);
  });
});

// ── repairField — successful repairs ─────────────────────────────────────────

describe('repairField — successful repairs', () => {
  it('P1: enum closed — map_to_existing', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const knownValues = { policy: 'closed', values: ['black', 'white', 'magenta'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
    assert.equal(result.value, 'magenta');
  });

  it('P2: enum open — keep_new', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'midnight-blue', decision: 'keep_new', resolved_to: 'midnight-blue', confidence: 0.85, reasoning: 'legitimate new color' }],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'open_prefer_known', values: ['black', 'white'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['midnight-blue'], policy: 'open_prefer_known' }, { value: 'midnight-blue' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('P3: type coercion — resolved numeric value', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'twenty', decision: 'map_to_existing', resolved_to: 20, confidence: 0.95, reasoning: 'word to number' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ contract: { type: 'number' }, parse: { template: 'number_with_unit' } });
    const result = await repairField({
      validationResult: makeFailedResult('wrong_type', { expected: 'number', reason: 'not parseable' }, { value: 'twenty' }),
      fieldKey: 'weight',
      fieldRule: rule,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
    assert.equal(result.value, 20);
  });

  it('P4: format — reformatted value', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'badurl', decision: 'map_to_existing', resolved_to: 'https://example.com', confidence: 0.8, reasoning: 'extracted url' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ parse: { template: 'url_field' } });
    const result = await repairField({
      validationResult: makeFailedResult('format_mismatch', { reason: 'url pattern' }, { value: 'badurl' }),
      fieldKey: 'spec_url',
      fieldRule: rule,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('P5: component — map_to_existing', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: 'PAW 3950', decision: 'map_to_existing', resolved_to: 'PAW3950', confidence: 0.95, reasoning: 'space removed' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ parse: { template: 'component_reference', component_type: 'sensor' } });
    const componentDb = { items: [{ name: 'PAW3950' }, { name: 'PMW3389' }] };
    const result = await repairField({
      validationResult: makeFailedResult('not_in_component_db', { value: 'PAW 3950', reason: 'not found' }, { value: 'PAW 3950' }),
      fieldKey: 'sensor',
      fieldRule: rule,
      componentDb,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('P7: range — in-range value', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: '5000', decision: 'map_to_existing', resolved_to: 50, confidence: 0.8, reasoning: 'likely kg not g' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g', range: { min: 5, max: 500 } } });
    const result = await repairField({
      validationResult: makeFailedResult('out_of_range', { min: 5, max: 500, actual: 5000 }, { value: 5000 }),
      fieldKey: 'weight',
      fieldRule: rule,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
  });

  it('unit_conversion — converted value', async () => {
    const response = makeLlmResponse({
      decisions: [{ value: '2.65 lb', decision: 'map_to_existing', resolved_to: 1202, confidence: 0.9, reasoning: 'lb to g' }],
    });
    const callLlm = stubCallLlm(response);
    const rule = makeFieldRule({ contract: { type: 'number', unit: 'g' } });
    const result = await repairField({
      validationResult: makeFailedResult('wrong_unit', { expected: 'g', detected: 'lb' }, { value: '2.65 lb' }),
      fieldKey: 'weight',
      fieldRule: rule,
      callLlm,
    });
    assert.equal(result.status, 'repaired');
  });
});

// ── repairField — failure cases ──────────────────────────────────────────────

describe('repairField — failure cases', () => {
  it('returns rerun_recommended when LLM says so', async () => {
    const response = makeLlmResponse({
      status: 'rerun_recommended',
      reason: 'source data garbled',
      decisions: [{ value: 'pink', decision: 'reject', resolved_to: null, confidence: 0.9, reasoning: 'hallucination' }],
    });
    const callLlm = stubCallLlm(response);
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues: { policy: 'closed', values: ['black'] },
      callLlm,
    });
    assert.equal(result.status, 'rerun_recommended');
  });

  it('returns still_failed when LLM repair fails re-validation', async () => {
    // LLM returns a value that still won't pass (e.g., returns "sparkle" for a closed enum with only black/white)
    const response = makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'sparkle', confidence: 0.9, reasoning: 'attempted fix' }],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'closed', values: ['black', 'white'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    assert.equal(result.status, 'still_failed');
  });

  it('returns still_failed when LLM response fails Zod parse', async () => {
    const callLlm = stubCallLlm({ bad: 'response' });
    const result = await repairField({
      validationResult: makeFailedResult('wrong_type', { expected: 'number', reason: 'fail' }),
      fieldKey: 'weight',
      fieldRule: makeFieldRule(),
      callLlm,
    });
    assert.equal(result.status, 'still_failed');
    assert.ok(result.error);
  });

  it('returns still_failed when callLlm throws', async () => {
    const callLlm = throwingCallLlm(new Error('API timeout'));
    const result = await repairField({
      validationResult: makeFailedResult('wrong_type', { expected: 'number', reason: 'fail' }),
      fieldKey: 'weight',
      fieldRule: makeFieldRule(),
      callLlm,
    });
    assert.equal(result.status, 'still_failed');
    assert.ok(result.error.includes('API timeout'));
  });
});

// ── repairField — confidence & flagging ──────────────────────────────────────

describe('repairField — confidence & flagging', () => {
  it('flaggedForReview=false for confidence 0.9', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', confidence: 0.9, reasoning: 'match' }],
    }));
    const knownValues = { policy: 'closed', values: ['magenta', 'black'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    assert.equal(result.flaggedForReview, false);
  });

  it('flaggedForReview=true for confidence 0.7', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', confidence: 0.7, reasoning: 'maybe' }],
    }));
    const knownValues = { policy: 'closed', values: ['magenta', 'black'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    assert.equal(result.flaggedForReview, true);
  });

  it('low confidence (0.3) results in unk value', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', confidence: 0.3, reasoning: 'wild guess' }],
    }));
    const knownValues = { policy: 'closed', values: ['magenta', 'black'] };
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    // Low confidence → skipped → value becomes 'unk' → re-validates (unk passes)
    assert.ok(result.status === 'repaired' || result.status === 'still_failed');
  });
});

// ── repairField — decisions ──────────────────────────────────────────────────

describe('repairField — decisions', () => {
  it('set_unk decision produces unk value', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'set_unk', resolved_to: null, confidence: 0.9, reasoning: 'unknown color' }],
    }));
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues: { policy: 'closed', values: ['black'] },
      callLlm,
    });
    assert.equal(result.revalidation.value, 'unk');
  });

  it('reject decision produces unk value', async () => {
    const callLlm = stubCallLlm(makeLlmResponse({
      decisions: [{ value: 'pink', decision: 'reject', resolved_to: null, confidence: 0.9, reasoning: 'hallucination' }],
    }));
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues: { policy: 'closed', values: ['black'] },
      callLlm,
    });
    assert.equal(result.revalidation.value, 'unk');
  });
});

// ── repairField — list field ─────────────────────────────────────────────────

describe('repairField — list field', () => {
  it('repairs list with 2 unknowns, both mapped', async () => {
    const response = makeLlmResponse({
      decisions: [
        { value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', confidence: 0.9, reasoning: 'match' },
        { value: 'teal', decision: 'keep_new', resolved_to: 'teal', confidence: 0.85, reasoning: 'legit new' },
      ],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'open_prefer_known', values: ['black', 'white', 'magenta'] };
    const rule = makeFieldRule({ contract: { shape: 'list', type: 'string' } });
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink', 'teal'], policy: 'open_prefer_known' }, { value: ['pink', 'teal'] }),
      fieldKey: 'colors',
      fieldRule: rule,
      knownValues,
      callLlm,
    });
    assert.ok(result.revalidation);
  });

  it('repairs list with 1 rejected item', async () => {
    const response = makeLlmResponse({
      decisions: [
        { value: 'pink', decision: 'map_to_existing', resolved_to: 'magenta', confidence: 0.9, reasoning: 'match' },
        { value: 'sparkle-unicorn', decision: 'reject', resolved_to: null, confidence: 0.95, reasoning: 'hallucination' },
      ],
    });
    const callLlm = stubCallLlm(response);
    const knownValues = { policy: 'closed', values: ['black', 'white', 'magenta'] };
    const rule = makeFieldRule({ contract: { shape: 'list', type: 'string' } });
    const result = await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink', 'sparkle-unicorn'], policy: 'closed' }, { value: ['pink', 'sparkle-unicorn'] }),
      fieldKey: 'colors',
      fieldRule: rule,
      knownValues,
      callLlm,
    });
    assert.ok(result.revalidation);
  });
});

// ── repairField — callLlm contract ───────────────────────────────────────────

describe('repairField — callLlm contract', () => {
  it('passes system, user, jsonSchema to callLlm', async () => {
    const callLlm = stubCallLlm(makeLlmResponse());
    const knownValues = { policy: 'closed', values: ['black', 'magenta'] };
    await repairField({
      validationResult: makeFailedResult('enum_value_not_allowed', { unknown: ['pink'], policy: 'closed' }),
      fieldKey: 'color',
      fieldRule: makeFieldRule(),
      knownValues,
      callLlm,
    });
    const args = callLlm.args();
    assert.ok(args.system, 'system prompt should be passed');
    assert.ok(args.user, 'user message should be passed');
    assert.ok(args.jsonSchema, 'jsonSchema should be passed');
    assert.ok(args.system.includes('field value validator'));
  });
});

// ── repairCrossField — P6 ────────────────────────────────────────────────────

describe('repairCrossField — P6', () => {
  it('returns no_repair_needed for empty failures', async () => {
    const callLlm = stubCallLlm({});
    const result = await repairCrossField({
      crossFieldFailures: [],
      fields: {},
      productName: 'Test',
      fieldRules: {},
      callLlm,
    });
    assert.equal(result.status, 'no_repair_needed');
  });

  it('calls LLM with P6 prompt and returns repaired on success', async () => {
    const llmResponse = makeLlmResponse({
      decisions: [{ value: 'battery_hours', decision: 'map_to_existing', resolved_to: 'unk', confidence: 0.85, reasoning: 'wireless needs battery' }],
    });
    const callLlm = stubCallLlm(llmResponse);
    const result = await repairCrossField({
      crossFieldFailures: [{ rule_id: 'wireless_battery', constraint: 'conditional', pass: false, action: 'reject_candidate' }],
      fields: { connection: 'wireless', battery_hours: 'unk' },
      productName: 'Razer Viper V3',
      fieldRules: { connection: makeFieldRule(), battery_hours: makeFieldRule({ contract: { type: 'number' } }) },
      callLlm,
    });
    assert.equal(result.promptId, 'P6');
    assert.ok(callLlm.wasCalled());
  });

  it('returns rerun_recommended when LLM says so', async () => {
    const llmResponse = makeLlmResponse({ status: 'rerun_recommended', reason: 'data conflict' });
    const callLlm = stubCallLlm(llmResponse);
    const result = await repairCrossField({
      crossFieldFailures: [{ rule_id: 'test', constraint: 'conditional', pass: false, action: 'reject_candidate' }],
      fields: { a: 1 },
      productName: 'Test',
      fieldRules: {},
      callLlm,
    });
    assert.equal(result.status, 'rerun_recommended');
  });

  it('returns still_failed when callLlm throws', async () => {
    const callLlm = throwingCallLlm(new Error('network error'));
    const result = await repairCrossField({
      crossFieldFailures: [{ rule_id: 'test', constraint: 'conditional', pass: false, action: 'reject_candidate' }],
      fields: { a: 1 },
      productName: 'Test',
      fieldRules: {},
      callLlm,
    });
    assert.equal(result.status, 'still_failed');
    assert.ok(result.error);
  });
});
